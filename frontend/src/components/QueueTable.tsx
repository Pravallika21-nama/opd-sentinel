import { useMemo, useState } from "react";
import type { QueueItem } from "../api/client";
import { duration, levelName, reviewStatusName, useLocale, type Copy } from "../lib/i18n";
import { consultationStatusName, consultationStatuses, consultationTone, isUrgent, vitalsSummary } from "../lib/workflow";
import { AnimatedNumber, EmptyState, Icon, Skeleton, type IconName } from "./ui";

const reviewStatuses = ["pending", "confirmed", "overridden", "escalated"] as const;

function levelBadge(level: number | null): string {
  if (level === null || level <= 2) return "pill pill-alert";
  if (level === 3) return "pill pill-amber";
  return "pill pill-navy";
}

function alertPills(item: QueueItem, t: Copy) {
  const pills: { label: string; tone: string }[] = [];
  if (item.abstain) pills.push({ label: t.alertCannotAssess, tone: "pill-alert" });
  if (item.red_flag) pills.push({ label: t.redFlag, tone: "pill-alert" });
  if (item.data_quality === "warning") pills.push({ label: t.alertVitals, tone: "pill-amber" });
  if (item.reassessment === "requested") pills.push({ label: t.actionReassess, tone: "pill-amber" });
  if (item.via_portal) pills.push({ label: t.ckPortal, tone: "pill-violet" });
  return pills;
}

const defaultIcons: Record<"red" | "amber" | "blue" | "green", IconName> = {
  red: "alert",
  amber: "clock",
  blue: "users",
  green: "check",
};

export function KpiCard({
  label,
  value,
  hint,
  tone,
  icon,
}: {
  label: string;
  value: number | string;
  hint: string;
  tone: "red" | "amber" | "blue" | "green";
  icon?: IconName;
}) {
  return (
    <article className={`kpi-card tone-${tone}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="kpi-card__label">{label}</p>
        <span className="kpi-card__icon" aria-hidden="true">
          <Icon name={icon ?? defaultIcons[tone]} className="h-4 w-4" />
        </span>
      </div>
      <p className="kpi-card__value">{typeof value === "number" ? <AnimatedNumber value={value} /> : value}</p>
      <p className="kpi-card__hint">{hint}</p>
    </article>
  );
}

export function QueuePlace({ item }: { item: Pick<QueueItem, "rank" | "arrival_position"> }) {
  const { t } = useLocale();
  if (!item.rank) return <span>—</span>;
  const moved = item.arrival_position ? item.arrival_position - item.rank : 0;
  return (
    <span className="queue-place">
      <span className="queue-place__rank">{item.rank}</span>
      {item.arrival_position ? <span className="text-[0.7rem] text-slate-500">{t.qArrived(item.arrival_position)}</span> : null}
      {moved > 0 ? <span className="queue-move is-up">{t.qMovedUp(moved)}</span> : null}
      {moved < 0 ? <span className="queue-move is-down">{t.qMovedDown(-moved)}</span> : null}
    </span>
  );
}

export function QueueTable({
  rows,
  onOpen,
  loading,
  error,
  onRetry,
  includeClosed,
  onIncludeClosed,
}: {
  rows: QueueItem[];
  onOpen: (id: string) => void;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  includeClosed?: boolean;
  onIncludeClosed?: (value: boolean) => void;
}) {
  const { t, locale } = useLocale();
  const [department, setDepartment] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [review, setReview] = useState("all");
  const [encounter, setEncounter] = useState("all");
  const [query, setQuery] = useState("");

  const departments = useMemo(
    () => [...new Set(rows.map((item) => item.department).filter(Boolean))].sort() as string[],
    [rows],
  );
  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return rows.filter((item) => {
      if (department !== "all" && item.department !== department) return false;
      if (urgency === "urgent" && !isUrgent(item)) return false;
      if (urgency !== "all" && urgency !== "urgent" && String(item.triage_level ?? "none") !== urgency) return false;
      if (review !== "all" && item.review_status !== review) return false;
      if (encounter !== "all" && (item.consultation_status ?? "registered") !== encounter) return false;
      if (needle) {
        const haystack = [item.opd_number, item.patient_ref, item.id, item.complaint_preview]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
  }, [rows, department, urgency, review, encounter, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="filter-bar" role="search">
        <label className="field-label grow">
          {t.searchQueue}
          <input className="field w-full" type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className="field-label">
          {t.urgency}
          <select className="field" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
            <option value="all">{t.allLevels}</option>
            <option value="urgent">{t.kpiUrgent}</option>
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>
                {t.levelN(level)} {levelName[locale][level]}
              </option>
            ))}
            <option value="none">{t.noLevel}</option>
          </select>
        </label>
        <label className="field-label">
          {t.filter}
          <select className="field" value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value="all">{t.all}</option>
            {departments.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          {t.reviewStatus}
          <select className="field" value={review} onChange={(event) => setReview(event.target.value)}>
            <option value="all">{t.allStatuses}</option>
            {reviewStatuses.map((value) => (
              <option key={value} value={value}>
                {reviewStatusName(t, value)}
              </option>
            ))}
          </select>
        </label>
        <label className="field-label">
          {t.encounterStatus}
          <select className="field" value={encounter} onChange={(event) => setEncounter(event.target.value)}>
            <option value="all">{t.allStatuses}</option>
            {consultationStatuses
              .filter((value) => includeClosed || (value !== "completed" && value !== "referred"))
              .map((value) => (
                <option key={value} value={value}>
                  {consultationStatusName(t, value)}
                </option>
              ))}
          </select>
        </label>
        {onIncludeClosed ? (
          <label className="flex min-h-10 items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={includeClosed} onChange={(event) => onIncludeClosed(event.target.checked)} />
            {t.includeClosed}
          </label>
        ) : null}
      </div>

      {loading ? (
        <div role="status" className="panel-flat">
          <span className="sr-only">{t.loading}</span>
          <Skeleton lines={5} />
        </div>
      ) : null}
      {error ? (
        <div className="error-note flex flex-wrap items-center gap-3" role="alert">
          <span>
            {t.dataUnavailable}. {error.message}
          </span>
          <button type="button" className="btn-secondary" onClick={onRetry}>
            {t.retry}
          </button>
        </div>
      ) : null}

      {!loading && !error ? (
        <p className="text-sm text-slate-500" aria-live="polite">
          {t.showing(filtered.length, rows.length)}
        </p>
      ) : null}

      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">{t.colOpd}</th>
              <th scope="col">{t.colUrgency}</th>
              <th scope="col">{t.colComplaint}</th>
              <th scope="col">{t.colVitals}</th>
              <th scope="col">{t.colAlerts}</th>
              <th scope="col">{t.department}</th>
              <th scope="col">{t.colElapsed}</th>
              <th scope="col">{t.colNurseStatus}</th>
              <th scope="col">{t.colDoctorStatus}</th>
              <th scope="col">{t.colAction}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => {
              const status = item.consultation_status ?? "registered";
              return (
                <tr key={item.id} className={isUrgent(item) ? "row-urgent" : undefined}>
                  <td>
                    <QueuePlace item={item} />
                  </td>
                  <td>
                    <p className="font-bold">{item.opd_number || t.opdPending}</p>
                    {item.patient_ref ? <p className="text-xs text-slate-500">{item.patient_ref}</p> : null}
                    {item.illustrative ? <p className="text-xs text-slate-500">{t.exampleNotReal}</p> : null}
                  </td>
                  <td>
                    <span className={levelBadge(item.triage_level)}>
                      {item.triage_level === null
                        ? t.unassessedNotLow
                        : `${item.triage_level} · ${levelName[locale][item.triage_level]}`}
                    </span>
                  </td>
                  <td className="max-w-56">{item.complaint_preview || t.noComplaint}</td>
                  <td className="whitespace-nowrap text-xs">{vitalsSummary(item)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {alertPills(item, t).map((pill) => (
                        <span key={pill.label} className={`pill ${pill.tone}`}>
                          {pill.label}
                        </span>
                      ))}
                      {alertPills(item, t).length === 0 ? <span className="text-slate-500">{t.none}</span> : null}
                    </div>
                  </td>
                  <td>{item.department ?? t.departmentPending}</td>
                  <td className="whitespace-nowrap">{duration(t, item.wait_seconds)}</td>
                  <td>{reviewStatusName(t, item.review_status)}</td>
                  <td>
                    <span className={`pill ${consultationTone(status)}`}>{consultationStatusName(t, status)}</span>
                  </td>
                  <td>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => onOpen(item.id)}
                      aria-label={`${t.open} ${item.opd_number || item.id}`}
                    >
                      {t.open}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && !loading && !error ? (
        <EmptyState icon={rows.length === 0 ? "check" : "inbox"} title={rows.length === 0 ? t.noneWaiting : t.noMatch} />
      ) : null}
    </div>
  );
}
