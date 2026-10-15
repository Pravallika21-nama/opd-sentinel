import { useQuery } from "@tanstack/react-query";
import { apiGet, type AuditRow } from "../api/client";
import { useLocale } from "../lib/i18n";
import { formatDateTime } from "../lib/workflow";

function detail(row: AuditRow): string {
  const payload = row.payload;
  if (typeof payload.reason === "string" && payload.reason) return payload.reason;
  if (typeof payload.note === "string" && payload.note) return payload.note;
  if (typeof payload.action === "string") return payload.action;
  if (typeof payload.opd_number === "string") return payload.opd_number;
  return "";
}

export function AuditPage({ onOpen }: { onOpen: (id: string) => void }) {
  const { t, locale } = useLocale();
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => apiGet<AuditRow[]>("/audit") });
  const rows = [...(audit.data ?? [])].reverse();

  return (
    <section className="panel">
      <h2 className="section-title">{t.auditTitle}</h2>
      <p className="mt-2 max-w-3xl text-sm">{t.auditIntro}</p>
      {audit.isPending ? <p role="status">{t.loading}</p> : null}
      {audit.isError ? (
        <p role="alert" className="error-note mt-2">
          {t.dataUnavailable}. {audit.error.message}
        </p>
      ) : null}
      <div className="table-scroll mt-3">
        <table className="data-table">
          <thead>
            <tr>
              {[t.colTime, t.encounter, t.colEvent, t.colActor, t.colDetail].map((heading) => (
                <th key={heading} scope="col">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="whitespace-nowrap">{formatDateTime(locale, row.created_at)}</td>
                <td>
                  <button type="button" className="font-semibold text-action underline" onClick={() => onOpen(row.case_id)}>
                    {row.case_id}
                  </button>
                </td>
                <td>{row.event}</td>
                <td>
                  {row.actor ?? t.actorSystem}
                  {row.actor_role ? <span className="block text-xs text-slate-500">{row.actor_role}</span> : null}
                </td>
                <td className="max-w-md">{detail(row)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {audit.data && audit.data.length === 0 ? <p className="mt-2 text-sm">{t.noAuditRows}</p> : null}
    </section>
  );
}
