import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import { useLocale } from "../lib/i18n";

type Section = Record<string, unknown> & { status?: string; reason?: string };
type Report = {
  status?: string;
  evaluation_kind?: string;
  data_source?: string;
  disclaimer?: string;
  generated_at?: string;
  cost_definition?: { undertriage_emergency_weight?: number; overtriage_weight?: number };
  sections?: Record<string, Section>;
};
type System = {
  classical_available?: boolean;
  quantum_available?: boolean;
  quantum_role?: string;
  data_source?: string;
  evaluation_report?: string;
  mimic_iv_ed?: string;
  mimic_iv_ed_source?: string;
};

const PENDING = "Pending evaluation.";

function num(section: Section | undefined, key: string): number | null {
  if (!section || section.status === "Pending") return null;
  const value = section[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nestedNum(section: Section | undefined, group: string, key: string): number | null {
  const block = section?.[group];
  if (!block || typeof block !== "object" || Array.isArray(block)) return null;
  const value = (block as Section)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pct(value: number | null): string {
  return value === null ? PENDING : `${Math.round(value * 1000) / 10}%`;
}

function plain(value: number | null, suffix = ""): string {
  return value === null ? PENDING : `${value}${suffix}`;
}

function Verdict({
  title,
  tag,
  experiment,
  section,
  note,
}: {
  title: string;
  tag: string;
  experiment: boolean;
  section: Section | undefined;
  note: string;
}) {
  const caught = num(section, "caught_emergencies");
  const total = num(section, "n_emergencies");
  const missed = num(section, "missed_emergencies");
  const falseAlerts = num(section, "false_alerts");
  const scored = num(section, "n");
  const nonEmergencies = scored !== null && total !== null ? scored - total : null;
  const share = caught !== null && total ? Math.min(100, (caught / total) * 100) : 0;

  return (
    <article className={`panel verdict ${experiment ? "is-experiment" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-title">{title}</h3>
        <span className={`tag ${experiment ? "tag-slate" : "tag-sky"}`}>{tag}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-600">Emergencies caught</p>
      <p className="verdict-big">{caught !== null && total !== null ? `${caught} of ${total}` : PENDING}</p>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${share}%` }} />
      </div>
      <dl className="fact-grid">
        <div className="fact">
          <dt>Emergencies missed</dt>
          <dd>{plain(missed)}</dd>
        </div>
        <div className="fact">
          <dt>False alarms</dt>
          <dd>
            {falseAlerts !== null && nonEmergencies !== null
              ? `${falseAlerts} of ${nonEmergencies}`
              : plain(falseAlerts)}
          </dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-slate-600">{note}</p>
    </article>
  );
}

export function EvaluationPage() {
  const { t } = useLocale();
  const report = useQuery({ queryKey: ["metrics"], queryFn: () => apiGet<Report>("/metrics") });
  const system = useQuery({ queryKey: ["system"], queryFn: () => apiGet<System>("/system") });
  if (report.isPending || system.isPending) return <p role="status">{t.loading}</p>;
  if (report.isError) return <p role="alert">{report.error.message}</p>;
  if (system.isError) return <p role="alert">{system.error.message}</p>;

  const data = report.data;
  const classical = data.sections?.classical;
  const quantum = data.sections?.quantum;
  const pipeline = data.sections?.pipeline;
  const runtime = data.sections?.runtime;
  const synthetic = (data.data_source ?? "").toLowerCase().includes("synthetic");
  const proxy = (data.evaluation_kind ?? "").toLowerCase().includes("proxy");

  const scored = num(classical, "n");
  const emergencies = num(classical, "n_emergencies");
  const missWeight = data.cost_definition?.undertriage_emergency_weight ?? null;
  const alarmWeight = data.cost_definition?.overtriage_weight ?? null;

  const cMissed = num(classical, "missed_emergencies");
  const qMissed = num(quantum, "missed_emergencies");
  const cAlarms = num(classical, "false_alerts");
  const pAlarms = num(pipeline, "false_alerts");
  const abstained = num(pipeline, "n_abstain");

  const meaning: string[] = [];
  if (cMissed !== null && qMissed !== null && emergencies !== null) {
    if (cMissed < qMissed) {
      meaning.push(
        `On the same ${emergencies} emergencies, Classical ML missed ${cMissed} and Quantum ML missed ${qMissed}. That is why Classical ML gives the live suggestion and Quantum ML stays an experiment.`,
      );
    } else if (cMissed === qMissed) {
      meaning.push(
        `Both models missed ${cMissed} of ${emergencies} emergencies on this test. Classical ML stays the live path because Quantum ML is still an experiment.`,
      );
    } else {
      meaning.push(
        `Quantum ML missed fewer emergencies on this test (${qMissed} against ${cMissed}). One synthetic test does not change the live path. The result would need repeating on real data first.`,
      );
    }
  }
  meaning.push(
    "Quantum ML can only raise urgency. If it misses an emergency, the Classical ML suggestion and the safety rules still apply.",
  );
  if (pAlarms !== null && cAlarms !== null && pAlarms > cAlarms) {
    meaning.push(
      `The full system raises ${pAlarms - cAlarms} more false alarms than Classical ML alone, because the safety rules escalate when in doubt. A false alarm costs nurse time. A missed emergency is treated as far worse.`,
    );
  }

  const rows: { label: string; help: string; values: [string, string, string] }[] = [
    {
      label: "Share of emergencies caught",
      help: "Also called recall or sensitivity. Higher is better.",
      values: [
        pct(num(classical, "emergency_recall")),
        pct(num(quantum, "emergency_recall")),
        pct(num(pipeline, "emergency_recall")),
      ],
    },
    {
      label: "Emergencies missed",
      help: "True emergencies given a non-urgent level. The most important number. Lower is better.",
      values: [plain(cMissed), plain(qMissed), plain(num(pipeline, "missed_emergencies"))],
    },
    {
      label: "False alarms",
      help: "Non-emergencies flagged as urgent. They cost nurse time, not patient safety.",
      values: [plain(cAlarms), plain(num(quantum, "false_alerts")), plain(pAlarms)],
    },
    {
      label: "Precision",
      help: "Of the cases flagged urgent, the share that were true emergencies.",
      values: [
        pct(num(classical, "emergency_precision")),
        pct(num(quantum, "emergency_precision")),
        pct(num(pipeline, "emergency_precision")),
      ],
    },
    {
      label: "Triage level matched",
      help: "Share of cases where the suggested level 1 to 5 matched the test label.",
      values: [
        pct(num(classical, "triage_level_accuracy")),
        pct(num(quantum, "triage_level_accuracy")),
        pct(num(pipeline, "triage_level_accuracy")),
      ],
    },
    {
      label: "Department matched",
      help: "Share of cases sent to the same department as the test label.",
      values: [
        pct(num(classical, "department_accuracy")),
        pct(num(quantum, "department_accuracy")),
        pct(num(pipeline, "department_accuracy")),
      ],
    },
    {
      label: "Weighted cost",
      help:
        missWeight !== null && alarmWeight !== null
          ? `A missed emergency counts ${missWeight} points and a false alarm ${alarmWeight}. Lower is better.`
          : "Missed emergencies weigh more than false alarms. Lower is better.",
      values: [plain(num(classical, "cost")), plain(num(quantum, "cost")), plain(num(pipeline, "cost"))],
    },
    {
      label: "Median time per case",
      help: "Measured on this computer. Not a hospital speed claim.",
      values: [
        plain(nestedNum(runtime, "classical", "p50_ms"), " ms"),
        plain(nestedNum(runtime, "quantum", "p50_ms"), " ms"),
        plain(nestedNum(runtime, "pipeline", "p50_ms"), " ms"),
      ],
    },
  ];

  return (
    <section className="flex flex-col gap-5">
      <article className="panel">
        <div className="flex flex-wrap gap-2">
          {synthetic ? <span className="tag tag-amber">Synthetic test records</span> : null}
          {proxy ? <span className="tag tag-amber">Local proxy evaluation</span> : null}
          <span className="tag tag-slate">Not clinical validation</span>
        </div>
        <h2 className="mt-3 text-xl font-bold tracking-tight">
          {scored !== null && emergencies !== null
            ? `Both models were tested on ${scored} records they never saw in training, including ${emergencies} true emergencies.`
            : "No evaluation has been run yet. Figures show Pending evaluation."}
        </h2>
        <p className="mt-2 max-w-4xl text-slate-600">
          OPD Sentinel has two models. <strong>Classical ML</strong> gives the suggestion a nurse sees.{" "}
          <strong>Quantum ML</strong> is a research experiment that runs on a quantum simulator, not quantum hardware.
          The key question is how many true emergencies each one missed, because missing an emergency
          {missWeight !== null && alarmWeight !== null
            ? ` is treated as ${missWeight / alarmWeight} times worse than a false alarm.`
            : " is treated as far worse than a false alarm."}
        </p>
      </article>

      <div className="verdict-grid">
        <Verdict
          title="Classical ML"
          tag="Live suggestion"
          experiment={false}
          section={classical}
          note={
            system.data.classical_available
              ? "Gives the suggestion shown on Live Triage. A nurse still confirms every case."
              : "The model file is not available, so cases are sent to the nurse."
          }
        />
        <Verdict
          title="Quantum ML"
          tag="Experiment only"
          experiment
          section={quantum}
          note={
            system.data.quantum_available
              ? system.data.quantum_role ?? "Simulator experiment. It cannot lower urgency."
              : "Quantum ML unavailable. Cases continue on Classical ML."
          }
        />
      </div>

      <article className="callout">
        <h3 className="section-title">What this means</h3>
        <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-slate-700">
          {meaning.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </article>

      <article className="panel">
        <h3 className="section-title">The full system: safety rules plus models</h3>
        <p className="section-sub">This is what a nurse actually receives.</p>
        <dl className="fact-grid">
          <div className="fact">
            <dt>Emergencies caught</dt>
            <dd>
              {num(pipeline, "caught_emergencies") !== null && num(pipeline, "n_emergencies") !== null
                ? `${num(pipeline, "caught_emergencies")} of ${num(pipeline, "n_emergencies")}`
                : PENDING}
            </dd>
          </div>
          <div className="fact">
            <dt>Emergencies missed</dt>
            <dd>{plain(num(pipeline, "missed_emergencies"))}</dd>
          </div>
          <div className="fact">
            <dt>False alarms</dt>
            <dd>{plain(pAlarms)}</dd>
          </div>
          <div className="fact">
            <dt>Sent to a nurse without a guess</dt>
            <dd>
              {abstained !== null && num(pipeline, "n") !== null
                ? `${abstained} of ${num(pipeline, "n")}`
                : PENDING}
            </dd>
          </div>
        </dl>
      </article>

      <article className="panel">
        <h3 className="section-title">Side-by-side numbers</h3>
        <p className="section-sub">Every figure is read from reports/results.json. Missing figures show Pending evaluation.</p>
        <div className="mt-4 overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Measure</th>
                <th>What it means</th>
                <th>Classical ML</th>
                <th>Quantum ML</th>
                <th>Full system</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="font-semibold">{row.label}</td>
                  <td className="text-slate-600">{row.help}</td>
                  {row.values.map((value, index) => (
                    <td key={index} className={value === PENDING ? "text-slate-500" : "font-semibold"}>
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <div className="grid gap-5 lg:grid-cols-2">
        <article className="panel">
          <h3 className="section-title">Where these numbers come from</h3>
          <dl className="mt-3 flex flex-col gap-3 text-sm">
            <div>
              <dt className="font-semibold">Test data</dt>
              <dd className="text-slate-600">
                {synthetic
                  ? "Synthetic records generated for this project. They are not real patients."
                  : data.data_source ?? PENDING}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">How it was scored</dt>
              <dd className="text-slate-600">
                {proxy
                  ? "A local proxy scorer. The official challenge evaluator was not used."
                  : data.evaluation_kind ?? PENDING}
              </dd>
            </div>
            <div>
              <dt className="font-semibold">Real hospital data (MIMIC-IV-ED)</dt>
              <dd className="text-slate-600">
                {system.data.mimic_iv_ed ?? PENDING} It needs credentialed access from{" "}
                <a
                  className="font-semibold text-sky-700 underline"
                  href={system.data.mimic_iv_ed_source ?? "https://physionet.org/content/mimic-iv-ed/"}
                  target="_blank"
                  rel="noreferrer"
                >
                  PhysioNet
                </a>
                . Nothing is downloaded automatically.
              </dd>
            </div>
            {data.generated_at ? (
              <div>
                <dt className="font-semibold">Report generated</dt>
                <dd className="text-slate-600">{new Date(data.generated_at).toLocaleString()}</dd>
              </div>
            ) : null}
          </dl>
        </article>

        <article className="panel">
          <h3 className="section-title">Words used on this page</h3>
          <dl className="glossary">
            <div>
              <dt>Held-out test</dt>
              <dd>Records kept aside and never used for training, so the score is not memorised.</dd>
            </div>
            <div>
              <dt>False alarm</dt>
              <dd>A non-emergency flagged as urgent. Safe for the patient, but it uses nurse time.</dd>
            </div>
            <div>
              <dt>Simulator</dt>
              <dd>Quantum ML runs on ordinary computers that imitate a quantum circuit. No speedup is claimed.</dd>
            </div>
            <div>
              <dt>Sent to a nurse without a guess</dt>
              <dd>When the input is too incomplete, the system says "Cannot assess, send to nurse now".</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  );
}
