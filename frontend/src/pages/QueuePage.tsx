import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiGet, type QueueItem } from "../api/client";
import { levelName, useLocale } from "../lib/i18n";

function waited(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours > 0) return `${hours} h ${minutes} m`;
  return `${minutes} min ${total % 60} s`;
}

export function QueuePage({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, locale } = useLocale();
  const queue = useQuery({ queryKey: ["queue"], queryFn: () => apiGet<QueueItem[]>("/queue") });
  const [department, setDepartment] = useState("all");
  const [urgency, setUrgency] = useState("all");
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [minWait, setMinWait] = useState("");

  const rows = queue.data ?? [];
  const departments = [...new Set(rows.map((item) => item.department).filter(Boolean))] as string[];
  const filtered = useMemo(() => {
    const minimum = minWait.trim() === "" ? 0 : Number(minWait) * 60;
    return rows.filter((item) => {
      if (department !== "all" && item.department !== department) return false;
      if (urgency !== "all" && String(item.triage_level ?? "none") !== urgency) return false;
      if (status !== "all" && item.review_status !== status) return false;
      if (query && !item.id.toLowerCase().includes(query.trim().toLowerCase())) return false;
      if (!Number.isNaN(minimum) && item.wait_seconds < minimum) return false;
      return true;
    });
  }, [rows, department, urgency, status, query, minWait]);

  const counts = [1, 2, 3, 4, 5].map((level) => ({
    level,
    n: rows.filter((item) => item.triage_level === level).length,
  }));

  return (
    <section className="flex flex-col gap-4">
      <div className="card">
      <h2 className="section-title">How the queue is ordered</h2>
      <p className="mt-1 max-w-3xl text-sm">
        Higher urgency is ahead of ordinary arrival order. Within the same level, earlier arrival is ahead.
        {` ${t.waitUnavailable}.`}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {counts.map((item) => (
          <p key={item.level} className="rounded-md border border-line bg-card px-3 py-2 text-sm">
            <span className="font-semibold">Level {item.level}</span> {item.n}
            <span className="sr-only"> {levelName[locale][item.level]}</span>
          </p>
        ))}
        <p className="rounded-md border border-line bg-card px-3 py-2 text-sm">
          <span className="font-semibold">Unassessed</span> {rows.filter((item) => item.abstain).length}
        </p>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-5">
        <label className="text-sm font-semibold">
          {t.search}
          <input className="field mt-1 w-full" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <label className="text-sm font-semibold">
          {t.filter}
          <select className="field mt-1 w-full" value={department} onChange={(event) => setDepartment(event.target.value)}>
            <option value="all">{t.all}</option>
            {departments.map((item) => (
              <option key={item} value={item}>{item}</option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t.urgency}
          <select className="field mt-1 w-full" value={urgency} onChange={(event) => setUrgency(event.target.value)}>
            <option value="all">All levels</option>
            {[1, 2, 3, 4, 5].map((level) => (
              <option key={level} value={level}>{level}</option>
            ))}
            <option value="none">No level</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          {t.reviewStatus}
          <select className="field mt-1 w-full" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="all">All statuses</option>
            <option value="pending">pending</option>
            <option value="confirmed">confirmed</option>
            <option value="overridden">overridden</option>
            <option value="escalated">escalated</option>
          </select>
        </label>
        <label className="text-sm font-semibold">
          Minimum wait (minutes)
          <input className="field mt-1 w-full" inputMode="numeric" value={minWait} onChange={(event) => setMinWait(event.target.value)} />
        </label>
      </div>
      </div>
      {queue.isPending ? <p role="status">{t.loading}</p> : null}
      {queue.isError ? <p role="alert">{queue.error.message}</p> : null}
      <div className="mt-3 overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {["#", "OPD number", t.level, t.department, t.waiting, "Flags", t.reviewStatus, "Review"].map((heading) => (
                <th key={heading} className="border-b border-line px-2 py-2">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} className="align-top">
                <td className="border-b border-line px-2 py-2">{item.rank}</td>
                <td className="border-b border-line px-2 py-2">
                  <p className="font-semibold">{item.opd_number || "Pending"}</p>
                  <p className="text-xs">{item.id}</p>
                  {item.illustrative ? <p className="text-xs">Example, not a real patient.</p> : null}
                </td>
                <td className="border-b border-line px-2 py-2">
                  {item.triage_level === null ? "No level" : `${item.triage_level} ${levelName[locale][item.triage_level]}`}
                  {item.abstain ? <p className="font-semibold text-alert">Cannot assess, send to nurse now</p> : null}
                </td>
                <td className="border-b border-line px-2 py-2">{item.department ?? "Pending"}</td>
                <td className="border-b border-line px-2 py-2">{waited(item.wait_seconds)}</td>
                <td className="border-b border-line px-2 py-2">
                  {item.red_flag ? "Red flag" : "None"}
                  {item.data_quality === "warning" ? <p>Check vitals</p> : null}
                </td>
                <td className="border-b border-line px-2 py-2">{item.review_status}</td>
                <td className="border-b border-line px-2 py-2">
                  <button type="button" className="btn-secondary" onClick={() => onOpen(item.id)}>
                    View
                  </button>
                  <p className="mt-1 max-w-xs text-xs">{item.position_reason}</p>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {filtered.length === 0 && !queue.isPending ? <p className="mt-3 text-sm">No encounters match these filters.</p> : null}
    </section>
  );
}
