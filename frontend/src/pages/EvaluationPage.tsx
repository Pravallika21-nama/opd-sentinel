import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import { useLocale } from "../lib/i18n";

type Section = Record<string, unknown> & { status?: string; reason?: string };
type Report = {
  status?: string;
  evaluation_kind?: string;
  data_source?: string;
  disclaimer?: string;
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

function shown(section: Section | undefined, key: string): string {
  if (!section || section.status === "Pending") return "Pending evaluation.";
  const value = section[key];
  if (value === null || value === undefined || value === "") return "Pending evaluation.";
  if (typeof value === "object") return "Pending evaluation.";
  return String(value);
}

function nested(section: Section | undefined, group: string, key: string): string {
  const value = section?.[group];
  if (!value || typeof value !== "object" || Array.isArray(value)) return "Pending evaluation.";
  const inner = (value as Section)[key];
  if (inner === null || inner === undefined || inner === "") return "Pending evaluation.";
  if (typeof inner === "object") return "Pending evaluation.";
  return String(inner);
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile">
      <dt className="text-xs font-semibold text-slate-500">{label}</dt>
      <dd><strong>{value}</strong></dd>
    </div>
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
  const runtime = data.sections?.runtime;
  const synthetic = (data.data_source ?? "").toLowerCase().includes("synthetic")
    || (data.evaluation_kind ?? "").toLowerCase().includes("proxy");

  return (
    <section className="flex flex-col gap-4">
      <article className="card">
        <h2 className="text-lg font-semibold">Quantum & AI Research</h2>
        <p className="mt-1 text-sm">
          Figures come only from reports/results.json and the system status. A missing figure is
          Pending evaluation. This is not clinical evidence and not a claim of quantum advantage.
        </p>
        {synthetic ? (
          <p className="mt-2 text-sm font-semibold">
            The stored evaluation is a synthetic or proxy run. It is not MIMIC-IV-ED validation.
          </p>
        ) : null}
        <p className="mt-2 text-sm">{data.disclaimer ?? "Pending evaluation."}</p>
      </article>
      <div className="grid gap-4 lg:grid-cols-2">
        <article className="card">
          <h3 className="font-semibold">Classical ML</h3>
          <p className="text-sm">Live recommendation path. Status: {system.data.classical_available ? "artefact present" : "artefact unavailable"}.</p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Metric label="Emergency recall" value={shown(classical, "emergency_recall")} />
            <Metric label="Emergency precision" value={shown(classical, "emergency_precision")} />
            <Metric label="Missed emergencies" value={shown(classical, "missed_emergencies")} />
            <Metric label="False alerts" value={shown(classical, "false_alerts")} />
            <Metric label="Records scored (n)" value={shown(classical, "n")} />
            <Metric label="True negatives" value={shown(classical, "true_negatives")} />
          </dl>
          <p className="mt-3 text-xs">
            A full confusion matrix and per-class triage table are Pending evaluation. True negatives appear only when the report stores them.
          </p>
        </article>
        <article className="card">
          <h3 className="font-semibold">Quantum ML</h3>
          <p className="text-sm">
            {system.data.quantum_available ? "Simulator artefact present." : "Quantum ML unavailable."} {system.data.quantum_role}
          </p>
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <Metric label="Emergency recall" value={shown(quantum, "emergency_recall")} />
            <Metric label="Emergency precision" value={shown(quantum, "emergency_precision")} />
            <Metric label="Missed emergencies" value={shown(quantum, "missed_emergencies")} />
            <Metric label="False alerts" value={shown(quantum, "false_alerts")} />
          </dl>
          <p className="mt-3 text-sm">
            Experimental. It does not make the live decision and cannot lower urgency.
          </p>
        </article>
      </div>
      <article className="card">
        <h3 className="font-semibold">Dataset</h3>
        <dl className="mt-3 grid gap-2 text-sm md:grid-cols-2">
          <Metric label="Report data source" value={data.data_source ?? "Pending evaluation."} />
          <Metric label="Evaluation kind" value={data.evaluation_kind ?? "Pending evaluation."} />
          <Metric label="Processed manifest" value={system.data.data_source ?? "Pending evaluation."} />
          <Metric label="MIMIC-IV-ED" value={system.data.mimic_iv_ed ?? "Pending evaluation."} />
          <Metric label="MIMIC-IV-ED source" value={system.data.mimic_iv_ed_source ?? "https://physionet.org/content/mimic-iv-ed/"} />
          <Metric label="Classical runtime p50 ms" value={nested(runtime, "classical", "p50_ms")} />
          <Metric label="Quantum runtime p50 ms" value={nested(runtime, "quantum", "p50_ms")} />
        </dl>
        <p className="mt-3 text-xs">
          MIMIC-IV-ED requires credentialed PhysioNet access. The prepare command inspects a local folder and does not download the files. Temperature is documented as Fahrenheit and is not converted. No emergency label is created from that source.
        </p>
      </article>
    </section>
  );
}
