import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import { HealthPage } from "./HealthPage";
import { useLocale, type Locale } from "../lib/i18n";

type SystemInfo = {
  product: string;
  classical_available: boolean;
  quantum_available: boolean;
  quantum_role: string;
  rules_banner: string;
  data_source: string;
  evaluation_report: string;
  audit: string;
  wait_time_estimate: string;
  complaint_note: string;
};

const locales: Locale[] = ["en", "hi", "te"];

export function SettingsPage() {
  const { t, locale, setLocale, compact, setCompact, demoMode, setDemoMode } = useLocale();
  const system = useQuery({ queryKey: ["system"], queryFn: () => apiGet<SystemInfo>("/system") });
  const info = system.data;

  return (
    <div className="flex max-w-3xl flex-col gap-4">
      <section className="panel">
        <h2 className="font-semibold">Interface language</h2>
        <p className="text-sm">Draft labels only. Product names stay in English. Not a clinical translation.</p>
        <div className="mt-2 flex gap-2">
          {locales.map((item) => (
            <button
              key={item}
              type="button"
              className={item === locale ? "btn-primary" : "btn-secondary"}
              aria-pressed={item === locale}
              onClick={() => setLocale(item)}
            >
              {item.toUpperCase()}
            </button>
          ))}
        </div>
      </section>
      <section className="panel">
        <h2 className="font-semibold">Display</h2>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} />
          Compact layout
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} />
          Demo mode: show labelled illustrative cases
        </label>
      </section>
      <section className="panel">
        <h2 className="font-semibold">System</h2>
        {system.isPending ? <p role="status">{t.loading}</p> : null}
        {system.isError ? <p role="alert">{system.error.message}</p> : null}
        {info ? (
          <dl className="mt-2 grid grid-cols-[12rem_1fr] gap-y-2 text-sm">
            <dt className="font-semibold">Product</dt>
            <dd>{info.product}</dd>
            <dt className="font-semibold">Classical ML</dt>
            <dd>{info.classical_available ? "Artefact present" : "Pending"}</dd>
            <dt className="font-semibold">Quantum ML</dt>
            <dd>{info.quantum_available ? "Artefact present" : "Pending"}. {info.quantum_role}</dd>
            <dt className="font-semibold">Rules</dt>
            <dd>{info.rules_banner}</dd>
            <dt className="font-semibold">Data</dt>
            <dd>{info.data_source}</dd>
            <dt className="font-semibold">Evaluation file</dt>
            <dd>{info.evaluation_report}</dd>
            <dt className="font-semibold">Audit</dt>
            <dd>{info.audit}</dd>
            <dt className="font-semibold">Predicted wait</dt>
            <dd>{info.wait_time_estimate === "unavailable" ? t.waitUnavailable : info.wait_time_estimate}</dd>
            <dt className="font-semibold">Complaint</dt>
            <dd>{info.complaint_note}</dd>
          </dl>
        ) : null}
      </section>
      <HealthPage />
    </div>
  );
}
