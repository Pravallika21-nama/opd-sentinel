import { dateLocale, fieldStatusName, levelName, useLocale, type Copy } from "../lib/i18n";
import type { TriageResult } from "../api/client";

const mark: Record<number, string> = { 1: "!!!", 2: "!!", 3: "!", 4: "·", 5: "–" };

export function fieldLabel(t: Copy, field: string): string {
  const labels: Record<string, string> = {
    age: t.age,
    sex: t.sex,
    systolic_bp: t.systolic,
    diastolic_bp: t.diastolic,
    pulse: t.pulse,
    temperature_c: t.temp,
    spo2: t.spo2,
    chief_complaint: t.complaint,
  };
  return labels[field] ?? field;
}

export function ResultCard({ result, compact = false }: { result: TriageResult; compact?: boolean }) {
  const { locale, t } = useLocale();
  const level = result.triage_level;
  const name = level ? levelName[locale][level] : "";
  const english = level ? levelName.en[level] : "";
  const status = result.model_status ?? (result.classical ? "ok" : "unavailable");
  const issues = result.validation_issues.filter((issue) => issue.status !== "ok");
  const assessed = result.assessed_at
    ? new Date(result.assessed_at).toLocaleString(dateLocale[locale], { dateStyle: "medium", timeStyle: "short" })
    : null;

  return (
    <article className="flex flex-col gap-4" aria-live="polite">
      <p className="topbar-kicker">{t.mlKicker}</p>
      {result.source_label ? (
        <p className="rounded-md border border-line bg-card px-4 py-3 font-semibold">{result.source_label}</p>
      ) : null}

      {result.abstain ? (
        <div role="alert" className="rounded-md bg-alert px-4 py-4 text-white">
          <p className="text-lg font-semibold">{t.cannotAssess}</p>
          {result.abstain_reasons.length > 0 ? (
            <ul className="mt-1 list-disc pl-5 text-sm">
              {result.abstain_reasons.map((reason) => (
                <li key={reason}>{reason}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-wrap items-end gap-4">
        {level ? (
          <p className={`triage-badge level-${level}`} data-level={level}>
            <span aria-hidden="true">{mark[level]}</span>
            <span>
              {level} {english}
              {locale !== "en" ? ` · ${name}` : ""}
            </span>
          </p>
        ) : (
          <p className="text-xl font-semibold">{t.noLevelIssued}</p>
        )}
        <div>
          <p className="text-lg">
            <span className="font-semibold">{t.department}: </span>
            {result.department ?? t.pending}
          </p>
          {result.department && result.department_source === "keyword_hint" ? (
            <p className="text-xs text-slate-500">{t.keywordDeptHint}</p>
          ) : null}
        </div>
      </div>

      <section className="rounded-lg border border-line bg-paper p-3" aria-label="Classical ML">
        <h3 className="text-base font-semibold">Classical ML</h3>
        {status === "ok" && result.classical ? (
          <>
            <p className="mt-2">
              {t.classicalLine(result.classical.level, result.classical.p_emergency.toFixed(3))}
            </p>
            {!compact ? <p className="mt-1 text-sm">{t.classicalNote}</p> : null}
          </>
        ) : (
          <p className={`mt-2 font-semibold ${status === "error" ? "text-alert" : ""}`} role={status === "error" ? "alert" : undefined}>
            {status === "error" ? t.modelStatusError : t.modelStatusUnavailable}
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500">
          {status === "ok" ? t.modelStatusOk : null}
          {assessed ? ` ${t.assessedAt(assessed)}` : null}
        </p>
      </section>

      <section aria-label={t.redFlags}>
        <h3 className="text-lg font-semibold">{t.redFlags}</h3>
        {result.red_flags.length === 0 ? (
          <p>{t.noneMatched}</p>
        ) : (
          <ul className="mt-2 list-disc pl-5">
            {result.red_flags.map((flag) => (
              <li key={flag.id}>
                <span className="font-semibold text-alert">{flag.label}</span>: “{flag.phrase}”. {t.notDiagnosis}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Safety-Rule Layer">
        <h3 className="text-lg font-semibold">Safety-Rule Layer</h3>
        {result.fired_rules.length === 0 ? (
          <p>{t.noRuleFired}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {result.fired_rules.map((rule) => (
              <li key={rule.id} className="rounded-md border border-line px-3 py-2">
                <span className="font-semibold">{rule.id}</span> {t.forcesLevel(rule.min_level)} {rule.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label={t.validationTitle}>
        <h3 className="text-lg font-semibold">{t.validationTitle}</h3>
        {issues.length === 0 ? (
          <p>{t.noValidationIssues}</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {issues.map((issue) => (
              <li key={issue.field}>
                <span className={`pill ${issue.status === "missing" ? "pill-slate" : "pill-amber"}`}>
                  {fieldStatusName(t, issue.status)}
                </span>{" "}
                <span className="font-semibold">{fieldLabel(t, issue.field)}</span>: {issue.detail}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p>
        <span className="font-semibold">{t.uncertainty}: </span>
        {result.uncertainty === null ? t.pending : result.uncertainty.toFixed(2)}
        {result.latency_ms !== undefined ? <span className="ml-3 text-sm text-slate-500">{t.latency(result.latency_ms)}</span> : null}
      </p>
      {!result.abstain && result.red_flags.length === 0 && result.fired_rules.length === 0 ? (
        <p className="text-sm text-slate-600">{t.noAlertNotSafe}</p>
      ) : null}
    </article>
  );
}
