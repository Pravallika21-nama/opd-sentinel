import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { apiGet, apiPost, type TriageResult } from "../api/client";
import { ResultCard } from "../components/ResultCard";
import { useLocale } from "../lib/i18n";

type CaseFile = {
  case_id: string;
  decision: TriageResult | null;
  reviews: { action: string; triage_level: number | null; reason: string }[];
};

export function CasePage({ caseId }: { caseId: string }) {
  const { t } = useLocale();
  const client = useQueryClient();
  const [reason, setReason] = useState("");
  const [level, setLevel] = useState("2");
  const [department, setDepartment] = useState("");
  const query = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => apiGet<CaseFile>(`/queue/${caseId}`),
  });
  const review = useMutation({
    mutationFn: (body: unknown) => apiPost(`/queue/${caseId}/review`, body),
    onSuccess: async () => {
      setReason("");
      await client.invalidateQueries({ queryKey: ["case", caseId] });
      await client.invalidateQueries({ queryKey: ["queue"] });
    },
  });

  function send(action: "confirm" | "override", event: FormEvent) {
    event.preventDefault();
    review.mutate({
      action,
      reason,
      triage_level: action === "override" ? Number(level) : null,
      department: department || null,
    });
  }

  if (query.isPending) return <p role="status">{t.loading}</p>;
  if (query.isError) return <p role="alert">{query.error.message}</p>;
  const decision = query.data.decision;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,0.7fr)]">
      <section className="rounded-lg border border-line bg-card p-4">
        <h1 className="mb-4 text-3xl font-semibold">{t.review}</h1>
        {decision ? <ResultCard result={{ ...decision, case_id: caseId }} /> : <p>Pending</p>}
      </section>
      <form className="flex flex-col gap-3">
        <label className="flex flex-col gap-1 font-semibold">
          {t.reason}
          <input className="field" value={reason} required minLength={3} onChange={(event) => setReason(event.target.value)} />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          {t.level}
          <select className="field" value={level} onChange={(event) => setLevel(event.target.value)}>
            {[1, 2, 3, 4, 5].map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          {t.department}
          <input className="field" value={department} onChange={(event) => setDepartment(event.target.value)} />
        </label>
        <button type="submit" className="min-h-12 rounded-md bg-teal font-semibold text-white" onClick={(event) => send("confirm", event)}>
          {t.confirm}
        </button>
        <button type="button" className="min-h-12 rounded-md border border-ink font-semibold" onClick={(event) => send("override", event)}>
          {t.override}
        </button>
        {review.isError ? <p role="alert">{review.error.message}</p> : null}
        <ul>
          {query.data.reviews.map((item, index) => (
            <li key={`${item.action}-${index}`}>
              {item.action} level {item.triage_level ?? "Pending"}: {item.reason}
            </li>
          ))}
        </ul>
      </form>
    </div>
  );
}
