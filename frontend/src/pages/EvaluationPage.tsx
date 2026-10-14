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

const blocks = ["classical", "quantum", "pipeline", "runtime", "robustness", "fairness", "queue_sim"] as const;
const keys = [
  "emergency_recall",
  "emergency_recall_ci95",
  "missed_emergencies",
  "false_alerts",
  "cost",
  "triage_level_accuracy",
  "department_accuracy",
  "abstention_rate",
  "abstention_appropriateness",
] as const;

function cell(section: Section | undefined, key: string): string {
  if (!section || section.status === "Pending") return "Pending";
  const value = section[key];
  if (value === null || value === undefined) return "Pending";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return "Pending";
  return String(value);
}

export function EvaluationPage() {
  const { t } = useLocale();
  const report = useQuery({ queryKey: ["metrics"], queryFn: () => apiGet<Report>("/metrics") });
  if (report.isPending) return <p role="status">{t.loading}</p>;
  if (report.isError) return <p role="alert">{report.error.message}</p>;
  const data = report.data;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">{t.evaluation}</h1>
      <p>{data.disclaimer ?? "Pending"}</p>
      <p>Data source: {data.data_source ?? "Pending"}</p>
      <p>Evaluation kind: {data.evaluation_kind ?? "Pending"}</p>
      <div className="overflow-x-auto">
        <table className="w-full border-collapse text-left">
          <thead>
            <tr>
              <th className="border border-line px-2 py-2">Metric</th>
              {blocks.map((name) => (
                <th key={name} className="border border-line px-2 py-2">
                  {name}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {keys.map((key) => (
              <tr key={key}>
                <th className="border border-line px-2 py-2 font-semibold">{key}</th>
                {blocks.map((name) => (
                  <td key={name} className="border border-line px-2 py-2">
                    {cell(data.sections?.[name], key)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
