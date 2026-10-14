import { levelName, useLocale } from "../lib/i18n";
import type { TriageResult } from "../api/client";

const mark: Record<number, string> = { 1: "!!!", 2: "!!", 3: "!", 4: "·", 5: "–" };

export function ResultCard({ result }: { result: TriageResult }) {
  const { locale, t } = useLocale();
  const level = result.triage_level;
  const name = level ? levelName[locale][level] : "";
  const english = level ? levelName.en[level] : "";

  return (
    <article className="flex flex-col gap-4" aria-live="polite">
      {result.source_label ? (
        <p className="rounded-md border border-line bg-card px-4 py-3 font-semibold">{result.source_label}</p>
      ) : null}

      {result.abstain ? (
        <p role="alert" className="rounded-md bg-alert px-4 py-4 text-lg font-semibold text-white">
          Cannot assess, send to nurse now
        </p>
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
          <p className="text-xl font-semibold">No triage level issued</p>
        )}
        <p className="text-lg">
          <span className="font-semibold">Department: </span>
          {result.department ?? "Pending"}
        </p>
      </div>

      {result.models_disagree ? (
        <p role="status" className="rounded-md border-2 border-alert px-4 py-3 text-lg font-semibold">
          Models disagree
        </p>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2">
        <section className="rounded-lg border border-line bg-card p-4" aria-label="Classical ML">
          <h3 className="text-lg font-semibold">Classical ML</h3>
          {result.classical ? (
            <p className="mt-2 text-lg">
              Level {result.classical.level}. Emergency probability {result.classical.p_emergency.toFixed(3)}.
            </p>
          ) : (
            <p className="mt-2">Classical ML artefact is not available.</p>
          )}
        </section>
        <section className="rounded-lg border border-line bg-card p-4" aria-label="Quantum ML">
          <h3 className="text-lg font-semibold">
            Quantum ML <span className="font-normal">({t.experimental})</span>
          </h3>
          {result.quantum ? (
            <p className="mt-2 text-lg">
              Level {result.quantum.level}. Risk score {result.quantum.p_emergency.toFixed(3)}. Simulator only.
            </p>
          ) : (
            <p className="mt-2 font-semibold">Quantum ML unavailable</p>
          )}
        </section>
      </div>

      <section aria-label="Red flags">
        <h3 className="text-lg font-semibold">Red flags</h3>
        {result.red_flags.length === 0 ? (
          <p>None matched.</p>
        ) : (
          <ul className="mt-2 list-disc pl-5">
            {result.red_flags.map((flag) => (
              <li key={flag.id}>
                {flag.label}: “{flag.phrase}”. Not a diagnosis.
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Safety-Rule Layer">
        <h3 className="text-lg font-semibold">Safety-Rule Layer</h3>
        {result.fired_rules.length === 0 ? (
          <p>No rule fired.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {result.fired_rules.map((rule) => (
              <li key={rule.id} className="rounded-md border border-line px-3 py-2">
                <span className="font-semibold">{rule.id}</span> forces level {rule.min_level}. {rule.reason}
              </li>
            ))}
          </ul>
        )}
      </section>

      <p>
        <span className="font-semibold">Uncertainty: </span>
        {result.uncertainty === null ? "Pending" : result.uncertainty.toFixed(2)}
      </p>
      {result.latency_ms !== undefined ? <p>Latency {result.latency_ms} ms</p> : null}

      {result.validation_issues.length > 0 ? (
        <ul className="text-sm">
          {result.validation_issues.map((issue) => (
            <li key={issue.field}>
              {issue.field}: {issue.status}. {issue.detail}
            </li>
          ))}
        </ul>
      ) : null}
    </article>
  );
}
