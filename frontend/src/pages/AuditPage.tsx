import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import { useLocale } from "../lib/i18n";

type AuditRow = {
  id: number;
  case_id: string;
  created_at: string;
  event: string;
  payload: { action?: string; reason?: string; actor?: string };
};

export function AuditPage({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useLocale();
  const audit = useQuery({ queryKey: ["audit"], queryFn: () => apiGet<AuditRow[]>("/audit") });

  return (
    <section>
      <h2 className="section-title">Every triage and review, in order</h2>
      <p className="mt-2 max-w-3xl text-sm">
        Rows are appended and are not edited by this application. The log is append-only within the
        application's database permissions. It is not cryptographically immutable.
      </p>
      {audit.isPending ? <p role="status">{t.loading}</p> : null}
      {audit.isError ? <p role="alert">{audit.error.message}</p> : null}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full border-collapse text-left text-sm">
          <thead>
            <tr>
              {["Time", t.encounter, "Event", "Actor", "Detail"].map((heading) => (
                <th key={heading} className="border-b border-line px-2 py-2">{heading}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(audit.data ?? []).map((row) => (
              <tr key={row.id}>
                <td className="border-b border-line px-2 py-2">{row.created_at}</td>
                <td className="border-b border-line px-2 py-2">
                  <button type="button" className="font-semibold text-action underline" onClick={() => onOpen(row.case_id)}>
                    {row.case_id}
                  </button>
                </td>
                <td className="border-b border-line px-2 py-2">{row.event}</td>
                <td className="border-b border-line px-2 py-2">{row.payload.actor ?? "system"}</td>
                <td className="border-b border-line px-2 py-2">{row.payload.reason ?? row.payload.action ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
