import { useQuery } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { apiGet } from "../api/client";
import { KpiCard } from "../components/QueueTable";
import { BarList, Donut, EmptyState, Icon, PageHero, RangeBars, SkeletonCards, StackBar, levelColors, type BarRow } from "../components/ui";
import { useLocale, type Copy } from "../lib/i18n";

type Quartiles = { n: number; median: number | null; q1: number | null; q3: number | null };
type Group = { label: string; count: number; urgent?: number; urgent_share?: number };
type LevelCount = { level: number; count: number };
type Outcome = LevelCount & { admitted: number; admitted_share: number; died?: number; length_of_stay_min: Quartiles };

type Common = {
  status: "measured";
  dataset: string;
  licence: string;
  setting: string;
  n: number;
  urgent: number;
  outcomes_by_level: Outcome[];
  length_of_stay_overall: Quartiles;
  arrival_mode: Group[];
  age_bands: Group[];
  top_complaints: Group[];
  top_diagnoses: Group[];
  data_notes: string[];
};

type Ktas = Common & {
  doi: string;
  expert_levels: LevelCount[];
  nurse_vs_expert: {
    compared: number;
    agree: number;
    under_triage: number;
    over_triage: number;
    urgent_called_non_urgent: number;
    reasons: Group[];
  };
  mental_status: Group[];
  length_of_stay_over_7_days: number;
};

type Mimic = Common & { source_url: string; labelled: number; admitted: number; acuity_levels: LevelCount[] };

type Pending = { status: "Pending"; reason: string };
type Insights = { ktas: Ktas | Pending; mimic_demo: Mimic | Pending };

type Tab = "ktas" | "mimic";

const pct = (value: number) => `${Math.round(value * 100)}%`;
const hours = (minutes: number) => Math.round((minutes / 60) * 10) / 10;

function shareRows(groups: Group[], minCount = 1): BarRow[] {
  return groups
    .filter((group) => group.count >= minCount && group.urgent_share !== undefined)
    .map((group) => ({
      label: group.label,
      value: group.urgent_share ?? 0,
      display: pct(group.urgent_share ?? 0),
      note: `${group.label}: ${group.urgent} / ${group.count}`,
      tone: (group.urgent_share ?? 0) >= 0.5 ? "tone-red" : (group.urgent_share ?? 0) >= 0.25 ? "tone-amber" : "tone-green",
    }));
}

function pooledShare(groups: Group[]): number {
  const count = groups.reduce((sum, group) => sum + group.count, 0);
  const urgent = groups.reduce((sum, group) => sum + (group.urgent ?? 0), 0);
  return count ? urgent / count : 0;
}

function patterns(t: Copy, data: Common, ktas: Ktas | null): string[] {
  const found: string[] = [];
  if (ktas) {
    const alert = ktas.mental_status.filter((group) => group.label === "Alert");
    const notAlert = ktas.mental_status.filter((group) => group.label !== "Alert");
    if (alert.length && notAlert.length) found.push(t.insPatternMental(pct(pooledShare(notAlert)), pct(pooledShare(alert))));
    const level2 = ktas.outcomes_by_level.find((row) => row.level === 2);
    const level5 = ktas.outcomes_by_level.find((row) => row.level === 5);
    if (level2 && level5) found.push(t.insPatternAdmission(pct(level2.admitted_share), pct(level5.admitted_share)));
    const mis = ktas.nurse_vs_expert;
    if (mis.compared && mis.reasons[0]) {
      found.push(t.insPatternMistriage(pct(mis.under_triage / mis.compared), pct(mis.over_triage / mis.compared), mis.reasons[0].label));
    }
  }
  const arrivals = data.arrival_mode.filter((group) => group.count >= 20 && group.label !== "Unknown");
  if (arrivals.length >= 2) {
    const sorted = [...arrivals].sort((a, b) => (b.urgent_share ?? 0) - (a.urgent_share ?? 0));
    const top = sorted[0];
    const bottom = sorted[sorted.length - 1];
    found.push(t.insPatternArrival(top.label, pct(top.urgent_share ?? 0), bottom.label, pct(bottom.urgent_share ?? 0)));
  }
  const complaints = data.top_complaints.slice(0, 10).filter((group) => group.count >= 10);
  if (complaints.length) {
    const top = [...complaints].sort((a, b) => (b.urgent_share ?? 0) - (a.urgent_share ?? 0))[0];
    found.push(t.insPatternComplaint(top.label, pct(top.urgent_share ?? 0)));
  }
  return found;
}

function Card({ title, children, className = "" }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`}>
      <h3 className="section-title">{title}</h3>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function DatasetView({ data, kind }: { data: Ktas | Mimic; kind: Tab }) {
  const { t } = useLocale();
  const ktas = kind === "ktas" ? (data as Ktas) : null;
  const mimic = kind === "mimic" ? (data as Mimic) : null;
  const scale = ktas ? "KTAS" : "ESI";
  const levels = ktas ? ktas.expert_levels : (mimic?.acuity_levels ?? []);
  const labelled = levels.reduce((sum, row) => sum + row.count, 0);
  const admitted = mimic ? mimic.admitted : data.outcomes_by_level.reduce((sum, row) => sum + row.admitted, 0);
  const stay = data.length_of_stay_overall.median;
  const found = patterns(t, data, ktas);
  const source = ktas ? ktas.doi : (mimic?.source_url ?? "");

  return (
    <div className="grid gap-5">
      <div className="kpi-grid is-4 stagger">
        <KpiCard label={t.insRecords} value={data.n} hint={data.setting} tone="blue" icon="database" />
        <KpiCard label={t.insUrgent} value={data.urgent} hint={labelled ? pct(data.urgent / labelled) : "—"} tone="red" icon="alert" />
        <KpiCard label={t.insAdmitted} value={admitted} hint={data.n ? pct(admitted / data.n) : "—"} tone="amber" icon="heart" />
        <KpiCard
          label={t.insMedianStay}
          value={stay === null ? "—" : t.insHours(hours(stay))}
          hint={
            data.length_of_stay_overall.q1 !== null && data.length_of_stay_overall.q3 !== null
              ? `${t.insHours(hours(data.length_of_stay_overall.q1))} – ${t.insHours(hours(data.length_of_stay_overall.q3))}`
              : ""
          }
          tone="green"
          icon="clock"
        />
      </div>

      {found.length ? (
        <section className="panel">
          <h3 className="section-title flex items-center gap-2">
            <Icon name="pulse" className="h-5 w-5 text-sky-700" />
            {t.insPatterns}
          </h3>
          <ul className="pattern-list stagger mt-3">
            {found.map((text) => (
              <li key={text} className="pattern">
                <span className="pattern__icon">
                  <Icon name="chart" className="h-4 w-4" />
                </span>
                <span>{text}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="insight-grid">
        <Card title={t.insLevels}>
          <Donut
            segments={levels.map((row) => ({ label: `${scale} ${row.level}`, value: row.count, color: levelColors[row.level] ?? "#94a3b8" }))}
            center={
              <>
                <strong className="text-2xl">{labelled}</strong>
                <span className="text-xs text-slate-500">{scale}</span>
              </>
            }
            caption={t.insLevels}
          />
          {mimic ? <p className="mt-3 text-xs text-slate-500">{t.insEsiNote}</p> : null}
        </Card>

        {ktas ? (
          <Card title={t.insNurseVsExpert}>
            <StackBar
              label={t.insNurseVsExpert}
              segments={[
                { label: t.insAgree, value: ktas.nurse_vs_expert.agree, color: "#15803d" },
                { label: t.insUnder, value: ktas.nurse_vs_expert.under_triage, color: "#b42318" },
                { label: t.insOver, value: ktas.nurse_vs_expert.over_triage, color: "#d4a017" },
              ]}
            />
            <p className="mt-3 text-sm font-semibold text-alert">{t.insUrgentMissed(ktas.nurse_vs_expert.urgent_called_non_urgent)}</p>
            <p className="mt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">{t.insReasons}</p>
            <div className="mt-2">
              <BarList label={t.insReasons} rows={ktas.nurse_vs_expert.reasons.map((row) => ({ label: row.label, value: row.count, tone: "tone-violet" }))} />
            </div>
          </Card>
        ) : null}

        <Card title={t.insAdmission}>
          <BarList
            label={t.insAdmission}
            max={1}
            rows={data.outcomes_by_level.map((row) => ({
              label: `${scale} ${row.level}`,
              value: row.admitted_share,
              display: `${pct(row.admitted_share)} · ${row.admitted}/${row.count}`,
              tone: "tone-teal",
            }))}
          />
          {ktas ? (
            <p className="mt-2 text-xs text-slate-500">
              {ktas.outcomes_by_level
                .filter((row) => row.died)
                .map((row) => `${scale} ${row.level}: ${t.insDied(row.died ?? 0)}`)
                .join(" · ")}
            </p>
          ) : null}
        </Card>

        <Card title={t.insStay}>
          <RangeBars
            label={t.insStay}
            max={24 * 60}
            unit={(minutes) => t.insHours(hours(minutes))}
            rows={data.outcomes_by_level.map((row) => ({
              label: `${scale} ${row.level}`,
              median: row.length_of_stay_min.median,
              q1: row.length_of_stay_min.q1,
              q3: row.length_of_stay_min.q3,
            }))}
          />
          <p className="mt-2 text-xs text-slate-500">0 – 24 h</p>
        </Card>

        <Card title={t.insArrival}>
          <BarList label={t.insArrival} max={1} rows={shareRows(data.arrival_mode, 5)} />
        </Card>

        {ktas ? (
          <Card title={t.insMental}>
            <BarList label={t.insMental} max={1} rows={shareRows(ktas.mental_status)} />
          </Card>
        ) : null}

        <Card title={t.insAge}>
          <BarList label={t.insAge} max={1} rows={shareRows(data.age_bands, 5)} />
        </Card>

        <Card title={t.insComplaints}>
          <BarList
            label={t.insComplaints}
            rows={data.top_complaints.slice(0, 10).map((row) => ({
              label: row.label,
              value: row.count,
              display: `${row.count} · ${pct(row.urgent_share ?? 0)} ${t.insShareUrgent}`,
              tone: (row.urgent_share ?? 0) >= 0.5 ? "tone-red" : "",
            }))}
          />
        </Card>

        <Card title={t.insDiagnoses} className="insight-wide">
          <BarList label={t.insDiagnoses} rows={data.top_diagnoses.slice(0, 10).map((row) => ({ label: row.label, value: row.count, tone: "tone-slate" }))} />
        </Card>
      </div>

      <section className="panel-flat grid gap-3 md:grid-cols-[2fr_1fr]">
        <div>
          <h3 className="text-sm font-bold">{t.insNotes}</h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">
            {data.data_notes.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </div>
        <dl className="text-sm">
          <dt className="text-xs font-semibold text-slate-500">{t.insSource}</dt>
          <dd>
            {data.dataset}
            {source ? (
              <a className="block break-all text-sky-700 underline" href={source} target="_blank" rel="noreferrer">
                {source}
              </a>
            ) : null}
          </dd>
          <dt className="mt-2 text-xs font-semibold text-slate-500">{t.insLicence}</dt>
          <dd>{data.licence}</dd>
        </dl>
      </section>
    </div>
  );
}

export function InsightsPage() {
  const { t } = useLocale();
  const [tab, setTab] = useState<Tab>("ktas");
  const query = useQuery({ queryKey: ["insights"], queryFn: () => apiGet<Insights>("/insights/datasets"), staleTime: 5 * 60_000 });
  const current = query.data ? (tab === "ktas" ? query.data.ktas : query.data.mimic_demo) : null;

  return (
    <div className="grid gap-5">
      <PageHero
        tone="navy"
        icon="database"
        title={t.insTitle}
        subtitle={t.insSub}
        actions={
          <div className="tabs" role="tablist" aria-label={t.insTitle}>
            <button type="button" role="tab" aria-selected={tab === "ktas"} onClick={() => setTab("ktas")}>
              {t.insTabKtas}
            </button>
            <button type="button" role="tab" aria-selected={tab === "mimic"} onClick={() => setTab("mimic")}>
              {t.insTabMimic}
            </button>
          </div>
        }
      />
      {query.isLoading ? <SkeletonCards className="is-4" /> : null}
      {query.error ? <p className="error-note">{query.error.message}</p> : null}
      {current && current.status === "Pending" ? (
        <EmptyState icon="database" title={t.insPending} body={current.reason} />
      ) : null}
      {current && current.status === "measured" ? <DatasetView key={tab} data={current} kind={tab} /> : null}
    </div>
  );
}
