import { useQuery } from "@tanstack/react-query";
import { apiGet, type QueueItem, type TriageResult } from "../api/client";
import { NurseActions } from "../components/NurseActions";
import { ResultCard } from "../components/ResultCard";
import { useLocale } from "../lib/i18n";

type Review = {
  action: string;
  triage_level: number | null;
  department: string | null;
  reason: string;
  created_at: string;
};

type CaseFile = {
  case_id: string;
  opd_number?: string;
  arrival_time: string;
  illustrative: boolean;
  input: Record<string, unknown>;
  decision: TriageResult | null;
  reviews: Review[];
};

type AuditRow = {
  id: number;
  created_at: string;
  event: string;
  payload: { reason?: string; action?: string };
};

export function RecordsPage({
  caseId,
  onOpen,
}: {
  caseId: string | null;
  onOpen: (id: string) => void;
}) {
  const { t } = useLocale();
  const queue = useQuery({ queryKey: ["queue"], queryFn: () => apiGet<QueueItem[]>("/queue") });
  const detail = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => apiGet<CaseFile>(`/queue/${caseId}`),
    enabled: Boolean(caseId),
  });
  const audit = useQuery({
    queryKey: ["audit", caseId],
    queryFn: () => apiGet<AuditRow[]>(`/audit?case_id=${caseId}`),
    enabled: Boolean(caseId),
  });
  const selected = detail.data;

  return (
    <div className="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]">
      <section className="panel">
        <h2 className="section-title">Encounters</h2>
        <p className="mt-1 text-sm">Synthetic and illustrative encounters are labelled. This is not a full chart.</p>
        <ul className="mt-3 flex flex-col gap-1">
          {(queue.data ?? []).map((item) => (
            <li key={item.id}>
              <button
                type="button"
                className={`w-full rounded-md px-2 py-2 text-left text-sm ${item.id === caseId ? "bg-action text-white" : "hover:bg-paper"}`}
                onClick={() => onOpen(item.id)}
              >
                <span className="font-semibold">{item.opd_number || item.id}</span>
                <span className="block">Level {item.triage_level ?? "none"} · {item.review_status}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
      <section>
        {!caseId ? <p>Select an encounter.</p> : null}
        {detail.isPending && caseId ? <p role="status">{t.loading}</p> : null}
        {detail.isError ? <p role="alert">{detail.error.message}</p> : null}
        {selected ? (
          <div className="flex flex-col gap-4">
            <header className="panel">
              <h2 className="text-lg font-semibold">{selected.opd_number || "OPD number pending"}</h2>
              <p className="text-sm">Internal encounter ID {selected.case_id}</p>
              <p className="text-sm">Arrival {selected.arrival_time}</p>
              {selected.illustrative ? <p className="text-sm font-semibold">Example, not a real patient. Not a real clinical outcome.</p> : null}
            </header>
            <section className="panel">
              <h3 className="font-semibold">Intake as entered</h3>
              <dl className="mt-2 grid grid-cols-2 gap-2 text-sm">
                {Object.entries(selected.input).map(([key, value]) => (
                  <div key={key}>
                    <dt className="font-semibold">{key}</dt>
                    <dd>{value === null || value === "" ? "blank" : String(value)}</dd>
                  </div>
                ))}
              </dl>
            </section>
            {selected.decision ? (
              <section className="panel">
                <h3 className="font-semibold">Model suggestion</h3>
                <p className="text-sm">This is not the nurse's final decision.</p>
                <ResultCard result={selected.decision} />
              </section>
            ) : (
              <p>Pending</p>
            )}
            <section className="panel">
              <h3 className="font-semibold">Nurse Review</h3>
              {selected.reviews.length === 0 ? <p className="text-sm">No nurse decision yet.</p> : null}
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {selected.reviews.map((review) => (
                  <li key={review.created_at} className="rounded-md border border-line px-3 py-2">
                    {review.action} level {review.triage_level ?? "unchanged"} at {review.created_at}. {review.reason}
                  </li>
                ))}
              </ul>
            </section>
            <section className="panel">
              <h3 className="font-semibold">Audit history</h3>
              {audit.isPending ? <p role="status">{t.loading}</p> : null}
              {audit.isError ? <p role="alert">{audit.error.message}</p> : null}
              {(audit.data ?? []).length === 0 && !audit.isPending ? <p className="text-sm">No audit rows for this encounter.</p> : null}
              <ul className="mt-2 flex flex-col gap-2 text-sm">
                {(audit.data ?? []).map((row) => (
                  <li key={row.id}>
                    {row.created_at}: {row.event}
                    {row.payload.reason ? `. ${row.payload.reason}` : ""}
                  </li>
                ))}
              </ul>
            </section>
            <NurseActions
              caseId={selected.case_id}
              suggestedLevel={selected.decision?.triage_level ?? null}
              department={selected.decision?.department ?? null}
              abstain={Boolean(selected.decision?.abstain)}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}
