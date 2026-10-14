import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost } from "../api/client";
import { useLocale } from "../lib/i18n";

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
  const [level, setLevel] = useState(suggestedLevel ?? 2);
  const [note, setNote] = useState<string | null>(null);

  const review = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost(`/queue/${caseId}/review`, body),
    onSuccess: async () => {
      setNote("Recorded in the audit log.");
      setReason("");
      await client.invalidateQueries({ queryKey: ["queue"] });
      await client.invalidateQueries({ queryKey: ["case", caseId] });
      await client.invalidateQueries({ queryKey: ["audit"] });
    },
  });

  function send(action: "confirm" | "override" | "escalate" | "reassess") {
    const body: Record<string, unknown> = { action, reason };
    if (action === "override") {
      body.triage_level = level;
      body.department = department;
    }
    review.mutate(body);
  }

  return (
    <section className="panel" aria-label={t.actions}>
      <h2 className="text-base font-semibold">{t.actions}</h2>
      <p className="mt-1 text-sm">
        The suggestion stays on the record. These actions append a Nurse Review.
      </p>
      <label className="mt-3 flex flex-col gap-1 text-sm font-semibold">
        {t.reason}
        <textarea
          className="field min-h-20"
          required
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
      </label>
      <label className="mt-3 flex flex-col gap-1 text-sm font-semibold">
        {t.level}
        <select
          className="field"
          value={level}
          onChange={(event) => setLevel(Number(event.target.value))}
        >
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
          disabled={reason.trim().length < 3 || review.isPending || (abstain && suggestedLevel === null)}
          onClick={() => send("confirm")}
        >
          {t.confirm}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={reason.trim().length < 3 || review.isPending}
          onClick={() => send("override")}
        >
          {t.override}
        </button>
        <button
          type="button"
          className="btn-alert"
          disabled={reason.trim().length < 3 || review.isPending}
          onClick={() => send("escalate")}
        >
          {t.escalate}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={reason.trim().length < 3 || review.isPending}
          onClick={() => send("reassess")}
        >
          {t.reassess}
        </button>
      </div>
      {abstain && suggestedLevel === null ? (
        <p className="mt-2 text-sm">There is no level to confirm. Override or escalate instead.</p>
      ) : null}
      {review.isError ? <p role="alert">{review.error.message}</p> : null}
      {note ? <p role="status">{note}</p> : null}
    </section>
  );
}
