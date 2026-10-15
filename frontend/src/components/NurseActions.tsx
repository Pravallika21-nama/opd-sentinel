import { useState } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, type Encounter } from "../api/client";
import { consultationStatusName } from "../lib/workflow";
import { reviewStatusName, useLocale } from "../lib/i18n";

export async function refreshEncounterViews(client: QueryClient, caseId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["queue"] }),
    client.invalidateQueries({ queryKey: ["encounter", caseId] }),
    client.invalidateQueries({ queryKey: ["case", caseId] }),
    client.invalidateQueries({ queryKey: ["audit"] }),
    client.invalidateQueries({ queryKey: ["station-summary"] }),
    client.invalidateQueries({ queryKey: ["doctor-queue"] }),
    client.invalidateQueries({ queryKey: ["operations"] }),
  ]);
}

export function NurseActions({
  caseId,
  suggestedLevel,
  department,
  abstain,
}: {
  caseId: string;
  suggestedLevel: number | null;
  department: string | null;
  abstain: boolean;
}) {
  const { t } = useLocale();
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const [handoff, setHandoff] = useState("");
  const [level, setLevel] = useState(suggestedLevel ?? 2);
  const [note, setNote] = useState<string | null>(null);

  const encounter = useQuery({
    queryKey: ["encounter", caseId],
    queryFn: () => apiGet<Encounter>(`/encounters/${caseId}`),
  });

  const review = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiPost<{ sent_to_doctor?: boolean }>(`/queue/${caseId}/review`, body),
    onSuccess: async (result) => {
      setNote(result.sent_to_doctor ? `${t.recordedInAudit} ${t.sentToDoctor}` : t.recordedInAudit);
      setReason("");
      await refreshEncounterViews(client, caseId);
    },
  });

  const send = useMutation({
    mutationFn: () => apiPost(`/encounters/${caseId}/send-to-doctor`, { note: handoff }),
    onSuccess: async () => {
      setNote(t.sentToDoctor);
      setHandoff("");
      await refreshEncounterViews(client, caseId);
    },
  });

  const status = encounter.data?.consultation_status ?? "registered";
  const reviewStatus = encounter.data?.review_status ?? "pending";
  const closed = status === "referred" || status === "completed";
  const withNurse = status === "registered";
  const decided = reviewStatus !== "pending" && encounter.data?.reassessment !== "requested";

  function act(action: "confirm" | "override" | "escalate" | "reassess") {
    if (action === "override" || action === "escalate") {
      const label = action === "override" ? t.overrideTo(level) : t.escalate;
      if (!window.confirm(t.confirmPrompt(label))) return;
    }
    setNote(null);
    const body: Record<string, unknown> = { action, reason };
    if (action === "override") {
      body.triage_level = level;
      body.department = department;
    }
    review.mutate(body);
  }

  const busy = review.isPending || send.isPending;
  const short = reason.trim().length < 3;

  return (
    <section className="panel" aria-label={t.actions}>
      <h2 className="text-base font-semibold">{t.actions}</h2>
      {encounter.data ? (
        <p className="mt-1 text-sm font-semibold text-slate-700">
          {t.statusLine(reviewStatusName(t, reviewStatus), consultationStatusName(t, status))}
        </p>
      ) : null}
      {closed ? (
        <p className="notice mt-3">{t.nurseClosed}</p>
      ) : (
        <>
          <p className="mt-1 text-sm">{t.actionsIntro}</p>
          <label className="mt-3 flex flex-col gap-1 text-sm font-semibold">
            {t.reason}
            <textarea
              className="field min-h-20"
              required
              maxLength={1000}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>
          <label className="mt-3 flex flex-col gap-1 text-sm font-semibold">
            {t.level}
            <select className="field" value={level} onChange={(event) => setLevel(Number(event.target.value))}>
              {[1, 2, 3, 4, 5].map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </label>
          <div className="mt-3 flex flex-col gap-2">
            <button
              type="button"
              className="btn-primary"
              disabled={short || busy || (abstain && suggestedLevel === null)}
              onClick={() => act("confirm")}
            >
              {t.confirm}
            </button>
            <button type="button" className="btn-secondary" disabled={short || busy} onClick={() => act("override")}>
              {t.override}
            </button>
            <button type="button" className="btn-alert" disabled={short || busy} onClick={() => act("escalate")}>
              {t.escalate}
            </button>
            <button type="button" className="btn-secondary" disabled={short || busy} onClick={() => act("reassess")}>
              {t.reassess}
            </button>
          </div>
          {withNurse ? <p className="mt-2 text-xs text-slate-500">{t.escalateSends}</p> : null}
          {abstain && suggestedLevel === null ? <p className="mt-2 text-sm">{t.noLevelToConfirm}</p> : null}

          {withNurse ? (
            <div className="form-section">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                {t.sendNote}
                <input
                  className="field"
                  maxLength={1000}
                  value={handoff}
                  onChange={(event) => setHandoff(event.target.value)}
                />
              </label>
              <button
                type="button"
                className="btn-primary mt-2 w-full"
                disabled={!decided || busy}
                onClick={() => {
                  setNote(null);
                  send.mutate();
                }}
              >
                {t.sendToDoctor}
              </button>
              {!decided ? <p className="mt-1 text-xs text-slate-500">{t.sendNeedsDecision}</p> : null}
            </div>
          ) : null}
        </>
      )}
      {review.isError ? (
        <p role="alert" className="error-note mt-3">
          {t.reviewNotSaved} {review.error.message}
        </p>
      ) : null}
      {send.isError ? (
        <p role="alert" className="error-note mt-3">
          {send.error.message}
        </p>
      ) : null}
      {note && !review.isError && !send.isError ? (
        <p role="status" className="success-note mt-3">
          {note}
        </p>
      ) : null}
    </section>
  );
}
