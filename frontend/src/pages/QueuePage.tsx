import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, type QueueItem } from "../api/client";
import { levelName, useLocale } from "../lib/i18n";

export function QueuePage({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, locale } = useLocale();
  const [department, setDepartment] = useState("all");
  const queue = useQuery({ queryKey: ["queue"], queryFn: () => apiGet<QueueItem[]>("/queue") });
  const rows = (queue.data ?? []).filter((item) => department === "all" || item.department === department);
  const departments = Array.from(new Set((queue.data ?? []).map((item) => item.department).filter(Boolean))) as string[];

  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">{t.queue}</h1>
      <label className="flex max-w-xs flex-col gap-1 font-semibold">
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
      {queue.isPending ? <p role="status">{t.loading}</p> : null}
      {queue.isError ? <p role="alert">{queue.error.message}</p> : null}
      {rows.length === 0 && queue.data ? <p>No cases in this view.</p> : null}
      <ul className="flex flex-col gap-3">
        {rows.map((item) => (
          <li key={item.id}>
            <button
              type="button"
              className="flex w-full flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-card px-4 py-3 text-left"
              onClick={() => onOpen(item.id)}
            >
              <span className="text-lg font-semibold">
                {item.triage_level
                  ? `${item.triage_level} ${levelName[locale][item.triage_level]}`
                  : "No level"}
                {item.abstain ? " · Cannot assess, send to nurse now" : ""}
              </span>
              <span>{item.department ?? "Pending"}</span>
              <span>
                {t.wait} {Math.round(item.wait_seconds / 60)} min
              </span>
              <span>{item.review_status}</span>
              <span className="w-full text-sm">{item.complaint_preview || "No complaint"}</span>
              {item.source_label ? <span className="text-sm font-semibold">{item.source_label}</span> : null}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
