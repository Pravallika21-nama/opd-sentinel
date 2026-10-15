import { useQuery } from "@tanstack/react-query";
import { apiGet, type QueueItem } from "../api/client";
import { levelName, useLocale } from "../lib/i18n";

const statusLabel: Record<QueueItem["review_status"], string> = {
  pending: "Pending",
  confirmed: "Nurse confirmed",
  overridden: "Nurse override",
  escalated: "Escalated to level 1",
};

export function DoctorReviewPage({ onOpen }: { onOpen: (id: string) => void }) {
  const { locale, t } = useLocale();
  const queue = useQuery({ queryKey: ["queue"], queryFn: () => apiGet<QueueItem[]>("/queue") });
  const ready = (queue.data ?? []).filter((item) => item.review_status !== "pending");
  const escalated = ready.filter((item) => item.review_status === "escalated").length;
  const overridden = ready.filter((item) => item.review_status === "overridden").length;
  const departments = new Map<string, QueueItem[]>();
  for (const item of ready) {
    const name = item.department ?? "Unassigned";
    departments.set(name, [...(departments.get(name) ?? []), item]);
  }
  const lanes = [...departments.entries()].sort((a, b) => b[1].length - a[1].length);

  return (
    <section className="flex flex-col gap-4">
      <header className="doctor-banner">
        <p className="text-xs font-semibold uppercase tracking-wide text-amber">After Nurse Review</p>
        <h2 className="mt-1 text-2xl font-semibold">{t.doctor}</h2>
        <p className="mt-1 max-w-3xl text-sm">
          Only cases a nurse has confirmed, overridden, or escalated. This board does not take new intakes
          and does not change urgency.
        </p>
      </header>
      {queue.isPending ? <p role="status">{t.loading}</p> : null}
      {queue.isError ? <p role="alert">{queue.error.message}</p> : null}
      <div className="stat-grid">
        <article className="card kpi">
          <span className="kpi-icon kpi-green">✓</span>
          <div>
            <p className="text-sm font-semibold text-slate-500">Ready for a doctor</p>
            <p className="stat-value">{ready.length}</p>
            <p className="text-xs">Nurse decision already stored.</p>
          </div>
        </article>
        <article className="card kpi">
          <span className="kpi-icon kpi-red">!</span>
          <div>
            <p className="text-sm font-semibold text-slate-500">Escalated</p>
            <p className="stat-value">{escalated}</p>
            <p className="text-xs">Nurse sent these to level 1.</p>
          </div>
        </article>
        <article className="card kpi">
          <span className="kpi-icon kpi-amber">≠</span>
          <div>
            <p className="text-sm font-semibold text-slate-500">Nurse overrides</p>
            <p className="stat-value">{overridden}</p>
            <p className="text-xs">Working level differs from the untouched suggestion.</p>
          </div>
        </article>
      </div>
      {lanes.length === 0 && !queue.isPending ? (
        <p className="card text-sm">No nurse-reviewed encounters yet. They appear here after confirm, override, or escalate.</p>
      ) : null}
      <div className="doctor-board">
        {lanes.map(([name, items]) => (
          <section key={name} className="card">
            <h3 className="text-base font-semibold">{name}</h3>
            <p className="text-xs text-slate-500">{items.length} handed over</p>
            <div className="mt-3 flex flex-col gap-2">
              {items.map((item) => (
                <article key={item.id} className="handoff">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-semibold">{item.opd_number || "OPD number pending"}</p>
                    <span className={item.review_status === "escalated" ? "pill pill-alert" : "pill pill-ok"}>
                      {statusLabel[item.review_status]}
                    </span>
                  </div>
                  <p className="mt-1 text-sm">
                    Level {item.triage_level ?? "—"}
                    {item.triage_level ? ` ${levelName[locale][item.triage_level]}` : ""}
                    {item.suggested_level != null && item.suggested_level !== item.triage_level
                      ? ` · model suggested ${item.suggested_level}`
                      : ""}
                  </p>
                  <p className="mt-1 text-sm">{item.complaint_preview || "No complaint recorded."}</p>
                  {item.illustrative ? <p className="mt-1 text-xs">Example, not a real patient.</p> : null}
                  <button type="button" className="btn-secondary mt-2" onClick={() => onOpen(item.id)}>
                    Open chart
                  </button>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </section>
  );
}
