import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import { HealthPage } from "./HealthPage";
import { useLocale, type Locale } from "../lib/i18n";

type SystemInfo = {
  product: string;
  classical_available: boolean;
  model?: { version?: string | null; emergency_threshold?: number | null; train_rows?: number | null };
  rules_banner: string;
  data_source: string;
  dataset?: string | null;
  dataset_licence?: string | null;
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
        <h2 className="font-semibold">{t.interfaceLanguage}</h2>
        <p className="text-sm">{t.languageNote}</p>
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
        <h2 className="font-semibold">{t.display}</h2>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={compact} onChange={(event) => setCompact(event.target.checked)} />
          {t.compactLayout}
        </label>
        <label className="mt-2 flex items-center gap-2 text-sm">
          <input type="checkbox" checked={demoMode} onChange={(event) => setDemoMode(event.target.checked)} />
          {t.demoModeLabel}
        </label>
      </section>
      <section className="panel">
        <h2 className="font-semibold">{t.navSystem}</h2>
        {system.isPending ? <p role="status">{t.loading}</p> : null}
        {system.isError ? <p role="alert">{system.error.message}</p> : null}
        {info ? (
          <dl className="mt-2 grid grid-cols-[12rem_1fr] gap-y-2 text-sm">
            <dt className="font-semibold">{t.product}</dt>
            <dd>{info.product}</dd>
            <dt className="font-semibold">Classical ML</dt>
            <dd>
              {info.classical_available ? t.artefactPresent : t.pending}
              {info.model?.version ? ` · ${info.model.version}` : ""}
              {info.model?.emergency_threshold != null ? ` · threshold ${info.model.emergency_threshold}` : ""}
            </dd>
            <dt className="font-semibold">{t.rulesLabel}</dt>
            <dd>{info.rules_banner}</dd>
            <dt className="font-semibold">{t.dataLabel}</dt>
            <dd>
              {info.dataset ?? info.data_source}
              {info.dataset_licence ? ` · ${info.dataset_licence}` : ""}
            </dd>
            <dt className="font-semibold">{t.evaluationFile}</dt>
            <dd>{info.evaluation_report}</dd>
            <dt className="font-semibold">{t.auditLabel}</dt>
            <dd>{info.audit}</dd>
            <dt className="font-semibold">{t.predictedWait}</dt>
            <dd>{info.wait_time_estimate === "unavailable" ? t.waitUnavailable : info.wait_time_estimate}</dd>
            <dt className="font-semibold">{t.colComplaint}</dt>
            <dd>{info.complaint_note}</dd>
          </dl>
        ) : null}
      </section>
      <HealthPage />
    </div>
  );
}
