import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import { useLocale } from "../lib/i18n";

type Rule = {
  id: string;
  description: string;
  min_level: number;
  reason: string;
  clinically_reviewed: boolean;
  condition: unknown;
};

type Flag = { id: string; label: string; phrases: string[] };

function formatCondition(condition: unknown): string {
  if (!condition || typeof condition !== "object") return "";
  const value = condition as Record<string, unknown>;
  if (typeof value.red_flag === "string") return `red flag ${value.red_flag}`;
  if (Array.isArray(value.all)) return value.all.map(formatCondition).join(" AND ");
  if (Array.isArray(value.any)) return value.any.map(formatCondition).join(" OR ");
  return `${String(value.field)} ${String(value.op)} ${String(value.value)}`;
}

export function RulesPage() {
  const { t } = useLocale();
  const rules = useQuery({
    queryKey: ["rules"],
    queryFn: () =>
      apiGet<{ note: string; rules: Rule[]; red_flags: Flag[]; languages: string }>("/rules"),
  });
  if (rules.isPending) return <p role="status">{t.loading}</p>;
  if (rules.isError) return <p role="alert">{rules.error.message}</p>;
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-3xl font-semibold">Safety-Rule Layer</h1>
      <p>{rules.data.note}</p>
      <p>{rules.data.languages}</p>
      <ul className="flex flex-col gap-3">
        {rules.data.rules.map((rule) => (
          <li key={rule.id} className="rounded-lg border border-line bg-card p-4">
            <p className="text-lg font-semibold">
              {rule.id} · minimum level {rule.min_level}
            </p>
            <p>{rule.description}</p>
            <p>{rule.reason}</p>
            <p className="text-sm">Condition: {formatCondition(rule.condition)}</p>
            <p className="text-sm">Clinically reviewed: {rule.clinically_reviewed ? "yes" : "no"}</p>
          </li>
        ))}
      </ul>
      <h2 className="text-2xl font-semibold">Red flags</h2>
      <ul className="flex flex-col gap-3">
        {rules.data.red_flags.map((flag) => (
          <li key={flag.id} className="rounded-lg border border-line bg-card p-4">
            <p className="font-semibold">{flag.label}</p>
            <p>{flag.phrases.join(" · ")}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}
