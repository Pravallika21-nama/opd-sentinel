import { useQuery } from "@tanstack/react-query";
import { apiGet, type QueueItem } from "../api/client";
import { levelName, useLocale } from "../lib/i18n";

type Summary = {
  patients_today: number;
  patients_today_rule: string;
  urgent_review: number;
  urgent_review_rule: string;
  emergency_alerts: number;
  emergency_alerts_rule: string;
  human_review_required: number;
  human_review_required_rule: string;
};

function waited(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} m`;
  return `${minutes} min`;
}

function shown(value: number | null | undefined, unit: string): string {
  if (value === null || value === undefined) return "blank";
  return `${value}${unit}`;
}

function alerts(item: QueueItem): string {
  const parts: string[] = [];
  if (item.triage_level === 1) parts.push("Level 1");
  if (item.red_flag) parts.push("Red flag");
  if (item.abstain) parts.push("Cannot assess");
  if (item.data_quality === "warning") parts.push("Vitals");
  return parts.length ? parts.join(", ") : "None";
}

function badgeClass(level: number | null): string {
  if (level !== null && level <= 2) return "badge badge--critical";
  if (level === 3) return "badge badge--warning";
  return "badge badge--info";
}

export function DashboardPage({
  onOpen,
  onNavigate,
}: {
  onOpen: (id: string) => void;
  onNavigate: (page: "live" | "queue") => void;
}) {
  const { locale } = useLocale();
  const summary = useQuery({
    queryKey: ["station-summary"],
    queryFn: () => apiGet<Summary>("/station/summary"),
  });
  const queue = useQuery({ queryKey: ["queue"], queryFn: () => apiGet<QueueItem[]>("/queue") });
  const waiting = (queue.data ?? []).filter((item) => item.review_status === "pending");
  const next = waiting[0];
  const cards: [string, number, string][] = summary.data
    ? [
        ["Patients today", summary.data.patients_today, "UTC arrivals. Not the waiting list."],
        ["Urgent review", summary.data.urgent_review, "Pending Nurse Review, level 1 or 2."],
        ["Emergency alerts", summary.data.emergency_alerts, "Pending Nurse Review, level 1."],
        ["Human review required", summary.data.human_review_required, "Pending, and unassessable or bad vitals."],
      ]
    : [];

  return (
    <div className="wiot">
      <header className="page-header">
        <div>
          <p className="stat-card__label">Next for Nurse Review</p>
          {next ? (
            <>
              <h2>{next.opd_number || next.id}</h2>
              <p className="page-header__desc">
                Level {next.triage_level ?? "—"}
                {next.triage_level ? ` ${levelName[locale][next.triage_level]}` : ""}
                {" · "}
                {next.department ?? "Department pending"}
                {" · "}
                {next.complaint_preview || "No complaint recorded."}
              </p>
            </>
          ) : (
            <h2>{queue.isPending ? "Working…" : "No case is waiting"}</h2>
          )}
        </div>
        <div className="page-header__actions">
          {next ? (
            <button type="button" className="btn btn--primary" onClick={() => onOpen(next.id)}>
              Open record
            </button>
          ) : null}
          <button type="button" className="btn btn--secondary" onClick={() => onNavigate("live")}>
            New intake
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => onNavigate("queue")}>
            Full queue
          </button>
        </div>
      </header>

      {summary.isPending || queue.isPending ? <p role="status">Working…</p> : null}
      {summary.isError ? <p role="alert">{summary.error.message}</p> : null}
      {queue.isError ? <p role="alert">{queue.error.message}</p> : null}

      {next ? (
        <div className="vital-grid" aria-label="Vitals as entered">
          <div className="vital-tile">
            <div className="vital-tile__label">Blood pressure</div>
            <div className="vital-tile__value">
              {shown(next.systolic_bp, "")}/{shown(next.diastolic_bp, "")}
            </div>
          </div>
          <div className="vital-tile">
            <div className="vital-tile__label">Pulse</div>
            <div className="vital-tile__value">{shown(next.pulse, " bpm")}</div>
          </div>
          <div className="vital-tile">
            <div className="vital-tile__label">Temperature</div>
            <div className="vital-tile__value">{shown(next.temperature_c, " °C")}</div>
          </div>
          <div className="vital-tile">
            <div className="vital-tile__label">SpO2</div>
            <div className="vital-tile__value">{shown(next.spo2, "%")}</div>
          </div>
        </div>
      ) : null}

      <div className="stat-grid">
        {cards.map(([label, value, hint]) => (
          <article key={label} className="stat-card" title={hint}>
            <div className="stat-card__label">{label}</div>
            <div className="stat-card__value">{value}</div>
            <div className="stat-card__hint">{hint}</div>
          </article>
        ))}
      </div>

      <div className="split-grid">
        <section className="panel">
          <div className="panel__header">
            <div>
              <h2 className="panel__title">Waiting for Nurse Review</h2>
              <p className="panel__subtitle">
                Safety-adjusted order, then earlier arrival. Elapsed time is time already waited, not a prediction.
              </p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Priority</th>
                  <th>OPD number</th>
                  <th>Complaint</th>
                  <th>Alerts</th>
                  <th>Department</th>
                  <th>Elapsed</th>
                  <th>Record</th>
                </tr>
              </thead>
              <tbody>
                {waiting.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <span className={badgeClass(item.triage_level)}>
                        {item.rank} · {item.triage_level ?? "—"}
                        {item.triage_level ? ` ${levelName[locale][item.triage_level]}` : ""}
                      </span>
                    </td>
                    <td>
                      <button type="button" className="table__link" onClick={() => onOpen(item.id)}>
                        {item.opd_number || "Pending"}
                      </button>
                      <p className="table__meta">{item.id}</p>
                      {item.illustrative ? <p className="table__meta">Example, not a real patient.</p> : null}
                    </td>
                    <td>{item.complaint_preview || "blank"}</td>
                    <td>{alerts(item)}</td>
                    <td>{item.department ?? "Pending"}</td>
                    <td>{waited(item.wait_seconds)}</td>
                    <td>
                      <button type="button" className="btn btn--secondary btn--sm" onClick={() => onOpen(item.id)}>
                        Open
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {waiting.length === 0 && !queue.isPending ? <p className="panel__subtitle">No case is waiting for Nurse Review.</p> : null}
          </div>
        </section>

        <section className="panel">
          <div className="panel__header">
            <div>
              <h2 className="panel__title">Still waiting</h2>
              <p className="panel__subtitle">The cases behind the one at the top.</p>
            </div>
          </div>
          <div className="alert-list">
            {waiting.slice(1, 6).map((item) => (
              <button key={item.id} type="button" className="alert-item" onClick={() => onOpen(item.id)}>
                <div className="alert-item__top">
                  <span className="alert-item__title">{item.opd_number || item.id}</span>
                  <span className={badgeClass(item.triage_level)}>L{item.triage_level ?? "—"}</span>
                </div>
                <p className="alert-item__message">{item.complaint_preview || "No complaint recorded."}</p>
                <p className="alert-item__meta">
                  {item.department ?? "Department pending"} · waited {waited(item.wait_seconds)}
                </p>
              </button>
            ))}
            {waiting.length <= 1 && !queue.isPending ? <p className="panel__subtitle">No further cases are waiting.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
