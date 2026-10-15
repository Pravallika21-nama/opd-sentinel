import type { SelfReport } from "../api/client";
import { useLocale } from "../lib/i18n";
import { formatDateTime } from "../lib/workflow";
import { Icon } from "./ui";

const homeVitals = [
  ["self_systolic_bp", "systolic", "mmHg"],
  ["self_diastolic_bp", "diastolic", "mmHg"],
  ["self_pulse", "pulse", "bpm"],
  ["self_temperature_c", "temp", "°C"],
  ["self_spo2", "spo2", "%"],
] as const;

const languages: Record<string, string> = { en: "English", hi: "हिन्दी", te: "తెలుగు" };

export function SelfReportPanel({ item, title, note }: { item: SelfReport; title?: string; note?: string }) {
  const { t, locale } = useLocale();
  const home = homeVitals.filter(([key]) => item.self_vitals[key] !== undefined);
  const rows: [string, string][] = [
    [t.pDuration, item.symptom_duration],
    [t.pSeverityShort, item.severity === null ? "" : t.pSeverityValue(item.severity)],
    [t.pConditions, item.known_conditions],
    [t.pMedications, item.medications],
    [t.pAllergies, item.allergies],
    [t.pLanguage, languages[item.preferred_language] ?? item.preferred_language],
  ];
  return (
    <section className="self-report" aria-label={title ?? t.ckSelfReport}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h4 className="flex items-center gap-2 font-bold text-violet-900">
          <Icon name="user" className="h-4 w-4" />
          {title ?? t.ckSelfReport}
        </h4>
        <span className="text-xs text-slate-500">{formatDateTime(locale, item.created_at)}</span>
      </div>
      <p className="mt-2 whitespace-pre-line font-semibold">{item.symptoms}</p>
      {item.red_flags.length ? (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-sm">
          <span className="pill pill-alert">{t.ckRedFlag}</span>
          {item.red_flags.map((flag) => (
            <span key={flag.id} className="chip">
              {flag.label}
            </span>
          ))}
        </p>
      ) : null}
      <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
        {rows
          .filter(([, value]) => value)
          .map(([label, value]) => (
            <div key={label}>
              <dt className="text-xs font-semibold text-slate-500">{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
      </dl>
      {home.length ? (
        <p className="mt-3 text-sm">
          <span className="text-xs font-semibold text-slate-500">{t.pHome}: </span>
          {home.map(([key, label, unit]) => `${t[label]} ${item.self_vitals[key]} ${unit}`).join(" · ")}
        </p>
      ) : null}
      <p className="mt-3 text-xs text-violet-800">{note ?? t.ckSelfNote}</p>
    </section>
  );
}
