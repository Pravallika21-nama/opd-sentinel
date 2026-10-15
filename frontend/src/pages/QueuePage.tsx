import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, type QueueItem } from "../api/client";
import { QueueTable } from "../components/QueueTable";
import { levelName, useLocale } from "../lib/i18n";

export function QueuePage({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, locale } = useLocale();
  const [includeClosed, setIncludeClosed] = useState(false);
  const queue = useQuery({
    queryKey: ["queue", includeClosed ? "all" : "open"],
    queryFn: () => apiGet<QueueItem[]>(`/queue${includeClosed ? "?include_closed=true" : ""}`),
    refetchInterval: 30000,
  });
  const rows = queue.data ?? [];
  const counts = [1, 2, 3, 4, 5].map((level) => ({
    level,
    n: rows.filter((item) => item.triage_level === level).length,
  }));

  return (
    <section className="flex flex-col gap-4">
      <div className="panel">
        <h2 className="section-title">{t.queueOrderTitle}</h2>
        <p className="mt-1 max-w-3xl text-sm">
          {t.queueOrderBody} {t.queueSub}
        </p>
        {queue.data ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {counts.map((item) => (
              <p key={item.level} className="rounded-md border border-line bg-card px-3 py-2 text-sm">
                <span className="font-semibold">{t.levelN(item.level)}</span> {item.n}
                <span className="sr-only"> {levelName[locale][item.level]}</span>
              </p>
            ))}
            <p className="rounded-md border border-line bg-card px-3 py-2 text-sm">
              <span className="font-semibold">{t.unassessed}</span> {rows.filter((item) => item.abstain).length}
            </p>
          </div>
        ) : null}
      </div>
      <div className="panel">
        <QueueTable
          rows={rows}
          onOpen={onOpen}
          loading={queue.isPending}
          error={queue.isError ? queue.error : null}
          onRetry={() => void queue.refetch()}
          includeClosed={includeClosed}
          onIncludeClosed={setIncludeClosed}
        />
      </div>
    </section>
  );
}
