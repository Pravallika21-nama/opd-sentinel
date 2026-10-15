import { useQuery } from "@tanstack/react-query";
import { apiGet, type AuditRow, type QueueItem } from "../api/client";
import { KpiCard } from "../components/QueueTable";
import { AnimatedNumber, Donut, Icon, LiveBadge, PageHero, SkeletonCards, type IconName } from "../components/ui";
import { dateLocale, duration, levelName, reviewStatusName, useLocale } from "../lib/i18n";
import { consultationStatusName, formatDateTime, formatTime, isUrgent } from "../lib/workflow";

type Minutes = { n: number; median_min: number | null; p90_min: number | null; max_min: number | null };

type Operations = {
  generated_at: string;
  as_of_date: string;
  kpis: {
    registered_today: number;
    waiting: number;
    awaiting_nurse_review: number;
    awaiting_doctor: number;
    urgent_waiting: number;
    in_consultation: number;
    completed_today: number;
    referred_today: number;
    prescriptions_today: number;
    prescriptions_total: number;
  };
  waiting_time: { currently_waiting: Minutes; seen_today: Minutes; definition: string };
  departments: {
    department: string;
    waiting: number;
    in_consultation: number;
    closed_today: number;
    urgent_waiting: number;
  }[];
  status_distribution: { status: string; count: number }[];
  nurse_review_distribution: { status: string; count: number }[];
  waiting_by_level: { level: string; count: number }[];
  daily_trend: { date: string; registrations: number }[];
  total_encounters: number;
};

function Bars({ rows, label }: { rows: { name: string; value: number; tone?: string }[]; label: string }) {
  const max = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="bar-chart" role="img" aria-label={label}>
      {rows.map((row) => (
        <div key={row.name} className="bar-row">
          <span className="truncate" title={row.name}>
            {row.name}
          </span>
          <span className="bar-track" aria-hidden="true">
            <span className={`bar-fill grow-in ${row.tone ?? ""}`} style={{ width: `${(row.value / max) * 100}%` }} />
          </span>
          <span className="bar-value">{row.value}</span>
        </div>
      ))}
    </div>
  );
}

function levelTone(level: string): string {
  if (level === "1" || level === "2" || level === "unassessed") return "tone-red";
  if (level === "3") return "tone-amber";
  return "";
}

const statusColors: Record<string, string> = {
  registered: "#0284c7",
  awaiting_doctor: "#d4a017",
  in_consultation: "#7c3aed",
  prescription_recorded: "#0f766e",
  referred: "#64748b",
  completed: "#15803d",
};

type FlowStage = { label: string; value: number; tone: "amber" | "blue" | "green" | "slate"; icon: IconName };

function PatientFlow({ stages }: { stages: FlowStage[] }) {
  const { t } = useLocale();
  return (
    <section className="panel" aria-labelledby="flow-title">
      <h2 id="flow-title" className="section-title">
        {t.opsFlowTitle}
      </h2>
      <p className="section-sub">{t.opsFlowSub}</p>
      <ol className="flow stagger mt-4">
        {stages.map((stage) => (
          <li key={stage.label} className={`flow-step tone-${stage.tone}`}>
            <span className="flow-step__icon">
              <Icon name={stage.icon} className="h-4 w-4" />
            </span>
            <span className="flow-step__value">
              <AnimatedNumber value={stage.value} />
            </span>
            <span className="flow-step__label">{stage.label}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function PriorityVsArrival({ rows, onOpen }: { rows: QueueItem[]; onOpen: (id: string) => void }) {
  const { t } = useLocale();
  const placed = rows.filter((item) => item.rank && item.arrival_position);
  const urgentMoved = placed.filter((item) => isUrgent(item) && (item.arrival_position ?? 0) > (item.rank ?? 0));
  const places = urgentMoved.reduce((sum, item) => sum + (item.arrival_position ?? 0) - (item.rank ?? 0), 0);
  const shown = 8;
  const columns: [string, QueueItem[], "arrival" | "priority"][] = [
    [t.qColArrival, [...placed].sort((a, b) => (a.arrival_position ?? 0) - (b.arrival_position ?? 0)).slice(0, shown), "arrival"],
    [t.qColPriority, [...placed].sort((a, b) => (a.rank ?? 0) - (b.rank ?? 0)).slice(0, shown), "priority"],
  ];
  return (
    <section className="panel">
      <h2 className="section-title">{t.qPlaceTitle}</h2>
      <p className="section-sub">{t.qPlaceSub}</p>
      <p className={`mt-3 text-sm font-semibold ${urgentMoved.length ? "text-alert" : "text-slate-600"}`}>
        {urgentMoved.length ? t.qUrgentMoved(urgentMoved.length, places) : t.qNoneMoved}
      </p>
      {placed.length === 0 ? (
        <p className="mt-2 text-sm">{t.noCaseWaiting}</p>
      ) : (
        <div className="order-compare mt-3">
          {columns.map(([title, list, kind]) => (
            <div key={kind} className={`order-col is-${kind}`}>
              <p className="order-col__title">{title}</p>
              <ol className="stagger grid gap-1.5">
                {list.map((item) => {
                  const moved = (item.arrival_position ?? 0) - (item.rank ?? 0);
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        className={`order-row ${isUrgent(item) ? "is-urgent" : ""}`}
                        onClick={() => onOpen(item.id)}
                      >
                        <span className="order-row__pos">{kind === "arrival" ? item.arrival_position : item.rank}</span>
                        <span className="min-w-0 flex-1 truncate">
                          <strong>{item.opd_number || item.id}</strong>{" "}
                          <span className="text-slate-500">{item.complaint_preview}</span>
                        </span>
                        <span className={`pill ${isUrgent(item) ? "pill-alert" : "pill-navy"}`}>
                          {item.triage_level === null ? t.unassessed : t.levelN(item.triage_level)}
                        </span>
                        {kind === "priority" && moved > 0 ? <span className="queue-move is-up">▲{moved}</span> : null}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export function OperationsPage({
  onOpen,
  onNavigate,
}: {
  onOpen: (id: string) => void;
  onNavigate: (page: "audit" | "queue") => void;
}) {
  const { t, locale } = useLocale();
  const ops = useQuery({
    queryKey: ["operations"],
    queryFn: () => apiGet<Operations>("/operations/summary"),
    refetchInterval: 30000,
  });
  const queue = useQuery({
    queryKey: ["queue", "open"],
    queryFn: () => apiGet<QueueItem[]>("/queue"),
    refetchInterval: 30000,
  });
  const audit = useQuery({
    queryKey: ["audit", "recent"],
    queryFn: () => apiGet<AuditRow[]>("/audit?limit=8"),
  });

  if (ops.isPending) {
    return (
      <div className="flex flex-col gap-5" role="status" aria-label={t.loading}>
        <div className="skeleton h-28 rounded-2xl" />
        <SkeletonCards count={4} className="is-4" />
        <div className="skeleton h-32 rounded-2xl" />
      </div>
    );
  }
  if (ops.isError) {
    return (
      <div className="error-note flex flex-wrap items-center gap-3" role="alert">
        <span>
          {t.dataUnavailable}. {ops.error.message}
        </span>
        <button type="button" className="btn-secondary" onClick={() => void ops.refetch()}>
          {t.retry}
        </button>
      </div>
    );
  }
  const data = ops.data;
  const k = data.kpis;
  const minutes = (value: number | null) => (value === null ? "—" : t.minutes(value));
  const deptName = (name: string) => (name === "Not assigned" ? t.notAssigned : name);

  return (
    <div className="flex flex-col gap-5">
      <PageHero
        tone="navy"
        icon="pulse"
        title={
          <>
            <AnimatedNumber value={k.waiting} /> {t.kpiWaiting.toLowerCase()}
          </>
        }
        subtitle={t.generatedAt(formatDateTime(locale, data.generated_at))}
        actions={
          <button type="button" className="btn-secondary" onClick={() => onNavigate("queue")}>
            {t.fullQueue}
          </button>
        }
        aside={
          <div className="flex flex-col items-end gap-2">
            <LiveBadge updatedAt={ops.dataUpdatedAt} fetching={ops.isFetching} />
            {k.urgent_waiting > 0 ? (
              <span className="hero-alert">
                <Icon name="alert" className="h-4 w-4" />
                {t.colUrgentWaiting}: {k.urgent_waiting}
              </span>
            ) : null}
          </div>
        }
      />

      <section className="kpi-grid is-4 stagger" aria-label={t.navOperations}>
        <KpiCard label={t.kpiRegistered} value={k.registered_today} hint={t.kpiRegisteredHint} tone="blue" icon="clipboard" />
        <KpiCard label={t.colUrgentWaiting} value={k.urgent_waiting} hint={t.kpiUrgentHint} tone="red" icon="alert" />
        <KpiCard
          label={t.opsMedianWait}
          value={minutes(data.waiting_time.currently_waiting.median_min)}
          hint={t.patientsN(data.waiting_time.currently_waiting.n)}
          tone="amber"
          icon="clock"
        />
        <KpiCard label={t.opsRxToday} value={k.prescriptions_today} hint={`${t.prescriptionsTitle}: ${k.prescriptions_total}`} tone="green" icon="pill" />
      </section>

      <PatientFlow
        stages={[
          { label: t.kpiAwaitingNurse, value: k.awaiting_nurse_review, tone: "amber", icon: "users" },
          { label: t.kpiAwaitingDoctor, value: k.awaiting_doctor, tone: "amber", icon: "stethoscope" },
          { label: t.opsInConsultation, value: k.in_consultation, tone: "blue", icon: "heart" },
          { label: t.opsCompleted, value: k.completed_today, tone: "green", icon: "check" },
          { label: t.opsReferred, value: k.referred_today, tone: "slate", icon: "send" },
        ]}
      />
      <p className="-mt-3 text-xs text-slate-500">{t.kpiOverlap}</p>

      {data.total_encounters === 0 ? <p className="panel">{t.noEncounters}</p> : null}

      <div className="dash-grid">
        <div className="dash-main">
          <PriorityVsArrival rows={queue.data ?? []} onOpen={onOpen} />
        </div>
        <section className="panel dash-side">
          <h2 className="section-title">{t.statusDistribution}</h2>
          <div className="mt-3">
            <Donut
              caption={t.statusDistribution}
              size={150}
              segments={data.status_distribution
                .filter((row) => row.count > 0)
                .map((row) => ({ label: consultationStatusName(t, row.status), value: row.count, color: statusColors[row.status] ?? "#94a3b8" }))}
              center={
                <>
                  <strong className="text-2xl">
                    <AnimatedNumber value={data.status_distribution.reduce((sum, row) => sum + row.count, 0)} />
                  </strong>
                  <span className="text-xs text-slate-500">{t.records}</span>
                </>
              }
            />
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <section className="panel">
          <h2 className="section-title">{t.waitTitle}</h2>
          <p className="section-sub">{t.waitSub}</p>
          <table className="data-table mt-3">
            <thead>
              <tr>
                <th scope="col"> </th>
                <th scope="col">{t.median}</th>
                <th scope="col">{t.p90}</th>
                <th scope="col">{t.longest}</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  [t.waitCurrent, data.waiting_time.currently_waiting],
                  [t.waitSeen, data.waiting_time.seen_today],
                ] as const
              ).map(([label, row]) => (
                <tr key={label}>
                  <th scope="row" className="normal-case">
                    {label}
                    <span className="block text-xs font-normal">{t.patientsN(row.n)}</span>
                  </th>
                  <td>{minutes(row.median_min)}</td>
                  <td>{minutes(row.p90_min)}</td>
                  <td>{minutes(row.max_min)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="panel">
          <h2 className="section-title">{t.levelDistribution}</h2>
          <div className="mt-3">
            <Bars
              label={t.levelDistribution}
              rows={data.waiting_by_level.map((row) => ({
                name: row.level === "unassessed" ? t.unassessed : `${t.levelN(row.level)} ${levelName[locale][Number(row.level)]}`,
                value: row.count,
                tone: levelTone(row.level),
              }))}
            />
          </div>
          <h3 className="mt-4 text-sm font-semibold">{t.colNurseStatus}</h3>
          <div className="mt-2">
            <Bars
              label={t.colNurseStatus}
              rows={data.nurse_review_distribution.map((row) => ({
                name: reviewStatusName(t, row.status),
                value: row.count,
                tone: row.status === "pending" ? "tone-amber" : row.status === "escalated" ? "tone-red" : "",
              }))}
            />
          </div>
        </section>

        <section className="panel">
          <h2 className="section-title">{t.dailyTrend}</h2>
          <div className="trend-chart mt-2" role="img" aria-label={t.dailyTrend}>
            {(() => {
              const max = Math.max(1, ...data.daily_trend.map((row) => row.registrations));
              return data.daily_trend.map((row) => (
                <div key={row.date} className="trend-col">
                  {row.registrations > 0 ? <span className="trend-count">{row.registrations}</span> : null}
                  <span className="trend-bar" style={{ height: `${(row.registrations / max) * 85}%` }} />
                </div>
              ));
            })()}
          </div>
          <div className="trend-labels mt-1" aria-hidden="true">
            {data.daily_trend.map((row) => (
              <span key={row.date}>
                {new Date(`${row.date}T00:00:00`).toLocaleDateString(dateLocale[locale], { day: "numeric", month: "short" })}
              </span>
            ))}
          </div>
          <details className="mt-2 text-sm">
            <summary className="cursor-pointer font-semibold">{t.sideBySide}</summary>
            <table className="data-table mt-2">
              <tbody>
                {data.daily_trend.map((row) => (
                  <tr key={row.date}>
                    <td>{row.date}</td>
                    <td>{row.registrations}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </details>
        </section>
      </div>

      <section className="panel">
        <h2 className="section-title">{t.deptWorkload}</h2>
        {data.departments.length === 0 ? (
          <p className="mt-1 text-sm">{t.noEncounters}</p>
        ) : (
          <div className="table-scroll mt-3">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">{t.department}</th>
                  <th scope="col">{t.colWaiting}</th>
                  <th scope="col">{t.colUrgentWaiting}</th>
                  <th scope="col">{t.colInConsult}</th>
                  <th scope="col">{t.colClosedToday}</th>
                  <th aria-hidden="true" />
                </tr>
              </thead>
              <tbody>
                {(() => {
                  const max = Math.max(1, ...data.departments.map((row) => row.waiting));
                  return data.departments.map((row) => (
                    <tr key={row.department}>
                      <td className="font-semibold">{deptName(row.department)}</td>
                      <td>{row.waiting}</td>
                      <td className={row.urgent_waiting > 0 ? "font-bold text-alert" : ""}>{row.urgent_waiting}</td>
                      <td>{row.in_consultation}</td>
                      <td>{row.closed_today}</td>
                      <td className="w-48" aria-hidden="true">
                        <span className="bar-track block">
                          <span className="bar-fill" style={{ width: `${(row.waiting / max) * 100}%` }} />
                        </span>
                      </td>
                    </tr>
                  ));
                })()}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">{t.queueOverview}</h2>
            <button type="button" className="btn-secondary" onClick={() => onNavigate("queue")}>
              {t.fullQueue}
            </button>
          </div>
          {queue.isError ? (
            <p role="alert" className="error-note mt-2">
              {t.dataUnavailable}. {queue.error.message}
            </p>
          ) : null}
          <ol className="mt-3 flex flex-col gap-2">
            {(queue.data ?? []).slice(0, 8).map((item) => (
              <li key={item.id}>
                <button
                  type="button"
                  className="flex w-full flex-wrap items-center gap-2 rounded-md border border-line px-3 py-2 text-left text-sm hover:bg-paper"
                  onClick={() => onOpen(item.id)}
                >
                  <span className="font-bold">
                    {item.rank}. {item.opd_number || item.id}
                  </span>
                  <span
                    className={`pill ${
                      item.abstain || (item.triage_level !== null && item.triage_level <= 2)
                        ? "pill-alert"
                        : item.triage_level === 3
                          ? "pill-amber"
                          : "pill-navy"
                    }`}
                  >
                    {item.triage_level === null ? t.unassessed : t.levelN(item.triage_level)}
                  </span>
                  <span className="text-slate-600">{consultationStatusName(t, item.consultation_status ?? "registered")}</span>
                  <span className="ml-auto text-slate-500">{duration(t, item.wait_seconds)}</span>
                </button>
              </li>
            ))}
          </ol>
          {queue.data && queue.data.length === 0 ? <p className="mt-2 text-sm">{t.noCaseWaiting}</p> : null}
        </section>

        <section className="panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="section-title">{t.recentAudit}</h2>
            <button type="button" className="btn-secondary" onClick={() => onNavigate("audit")}>
              {t.viewAudit}
            </button>
          </div>
          {audit.isError ? (
            <p role="alert" className="error-note mt-2">
              {t.dataUnavailable}. {audit.error.message}
            </p>
          ) : null}
          <ul className="mt-3 flex flex-col gap-1 text-sm">
            {[...(audit.data ?? [])].reverse().map((row) => (
              <li key={row.id} className="flex flex-wrap gap-2">
                <span className="font-semibold">{formatTime(locale, row.created_at)}</span>
                <span>{row.event}</span>
                <span className="text-slate-500">{row.actor ?? t.actorSystem}</span>
              </li>
            ))}
          </ul>
          {audit.data && audit.data.length === 0 ? <p className="text-sm">{t.noAuditRows}</p> : null}
        </section>
      </div>
    </div>
  );
}
