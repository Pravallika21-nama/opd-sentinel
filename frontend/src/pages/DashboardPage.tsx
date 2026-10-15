import { useQuery } from "@tanstack/react-query";
import { apiGet, type Checkin, type QueueItem } from "../api/client";
import { KpiCard, QueueTable } from "../components/QueueTable";
import { Icon, LiveBadge, PageHero, SkeletonCards } from "../components/ui";
import { levelName, useLocale } from "../lib/i18n";
import { awaitingNurse } from "../lib/workflow";

type StationSummary = {
  registered_today: number;
  waiting: number;
  awaiting_nurse_review: number;
  urgent_alerts: number;
  awaiting_doctor: number;
  vital_warnings: number;
};

export function DashboardPage({
  onOpen,
  onNavigate,
}: {
  onOpen: (id: string) => void;
  onNavigate: (page: "live" | "queue" | "checkins") => void;
}) {
  const { locale, t } = useLocale();
  const summary = useQuery({
    queryKey: ["station-summary"],
    queryFn: () => apiGet<StationSummary>("/station/summary"),
    refetchInterval: 15_000,
  });
  const queue = useQuery({
    queryKey: ["queue", "open"],
    queryFn: () => apiGet<QueueItem[]>("/queue"),
    refetchInterval: 15_000,
  });
  const checkins = useQuery({
    queryKey: ["checkins", "submitted"],
    queryFn: () => apiGet<Checkin[]>("/checkins?status=submitted"),
    refetchInterval: 15_000,
  });
  const rows = queue.data ?? [];
  const next = rows.find(awaitingNurse);
  const waitingCheckins = checkins.data?.length ?? 0;
  const flaggedCheckins = (checkins.data ?? []).filter((item) => item.red_flags.length).length;
  const value = (n: number | undefined) => (summary.isError || n === undefined ? t.dataUnavailable : n);
  const urgentNext = next ? next.abstain || (next.triage_level !== null && next.triage_level <= 2) : false;

  return (
    <div className="flex flex-col gap-5">
      <PageHero
        tone={urgentNext ? "violet" : "sky"}
        icon="stethoscope"
        kicker={t.nextForReview}
        title={next ? next.opd_number || t.opdPending : queue.isPending ? t.loading : t.noCaseWaiting}
        subtitle={
          next ? (
            <>
              {next.triage_level ? `${t.levelN(next.triage_level)} ${levelName[locale][next.triage_level]}` : t.unassessedNotLow}
              {" · "}
              {next.department ?? t.departmentPending}
              {" · "}
              {next.complaint_preview || t.noComplaint}
            </>
          ) : null
        }
        actions={
          <>
            {next ? (
              <button type="button" className="btn-primary" onClick={() => onOpen(next.id)}>
                {t.openRecord}
              </button>
            ) : null}
            <button type="button" className="btn-secondary" onClick={() => onNavigate("live")}>
              <Icon name="plus" className="h-4 w-4" />
              {t.navRegister}
            </button>
          </>
        }
        aside={queue.dataUpdatedAt ? <LiveBadge updatedAt={queue.dataUpdatedAt} fetching={queue.isFetching} /> : null}
      />

      {waitingCheckins > 0 ? (
        <section className={`panel flex flex-wrap items-center justify-between gap-3 ${flaggedCheckins ? "row-urgent" : ""}`}>
          <div className="flex items-center gap-3">
            <span className="kpi-card__icon" style={{ background: "#f3e8ff", color: "#6d28d9" }}>
              <Icon name="inbox" className="h-5 w-5" />
            </span>
            <div>
              <p className="font-bold">
                {t.ckKpi}: {waitingCheckins}
                {flaggedCheckins ? <span className="pill pill-alert ml-2">{t.ckRedFlag}: {flaggedCheckins}</span> : null}
              </p>
              <p className="text-sm text-slate-600">{t.ckKpiHint}</p>
            </div>
          </div>
          <button type="button" className="btn-primary" onClick={() => onNavigate("checkins")}>
            {t.ckOpenDesk}
          </button>
        </section>
      ) : null}

      {summary.isPending ? (
        <SkeletonCards count={6} className="is-6" />
      ) : (
        <section className="kpi-grid is-6 stagger" aria-label={t.home}>
          <KpiCard label={t.kpiRegistered} value={value(summary.data?.registered_today)} hint={t.kpiRegisteredHint} tone="blue" icon="clipboard" />
          <KpiCard label={t.kpiWaiting} value={value(summary.data?.waiting)} hint={t.kpiWaitingHint} tone="blue" icon="clock" />
          <KpiCard label={t.kpiAwaitingNurse} value={value(summary.data?.awaiting_nurse_review)} hint={t.kpiAwaitingNurseHint} tone="amber" icon="users" />
          <KpiCard label={t.kpiUrgent} value={value(summary.data?.urgent_alerts)} hint={t.kpiUrgentHint} tone="red" icon="alert" />
          <KpiCard label={t.kpiAwaitingDoctor} value={value(summary.data?.awaiting_doctor)} hint={t.kpiAwaitingDoctorHint} tone="green" icon="stethoscope" />
          <KpiCard label={t.kpiVitals} value={value(summary.data?.vital_warnings)} hint={t.kpiVitalsHint} tone="amber" icon="thermo" />
        </section>
      )}
      {summary.isError ? (
        <div className="error-note flex flex-wrap items-center gap-3" role="alert">
          <span>
            {t.dataUnavailable}. {summary.error.message}
          </span>
          <button type="button" className="btn-secondary" onClick={() => void summary.refetch()}>
            {t.retry}
          </button>
        </div>
      ) : null}
      <p className="-mt-3 text-xs text-slate-500">{t.kpiOverlap}</p>

      <section className="panel">
        <h2 className="section-title">{t.queueTitle}</h2>
        <p className="section-sub mb-3">{t.queueSub}</p>
        <QueueTable
          rows={rows}
          onOpen={onOpen}
          loading={queue.isPending}
          error={queue.isError ? queue.error : null}
          onRetry={() => void queue.refetch()}
        />
      </section>
    </div>
  );
}
