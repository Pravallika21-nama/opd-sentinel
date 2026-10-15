import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { apiGet, apiPost, type FieldIssue } from "../api/client";
import { useLocale } from "../lib/i18n";

type Rule = {
  id: string;
  description: string;
  min_level: number;
  reason: string;
  clinically_reviewed: boolean;
  when?: unknown;
};

type RuleFile = {
  clinically_reviewed: boolean;
  note: string;
  rules: Rule[];
};

type Check = {
  banner: string;
  note: string;
  rule_level: number | null;
  fired_rules: Rule[];
  validation_issues: FieldIssue[];
  red_flags: { id: string; label: string; phrase: string }[];
};

export function RulesPage() {
  const { t } = useLocale();
  const rules = useQuery({ queryKey: ["rules"], queryFn: () => apiGet<RuleFile>("/rules") });
  const [spo2, setSpo2] = useState("");
  const [pulse, setPulse] = useState("");
  const [temp, setTemp] = useState("");
  const [age, setAge] = useState("");
  const [sbp, setSbp] = useState("");
  const [complaint, setComplaint] = useState("");
  const check = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<Check>("/rules/check", body),
  });

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));
    check.mutate({
      age: numberOrNull(age),
      spo2: numberOrNull(spo2),
      pulse: numberOrNull(pulse),
      temperature_c: numberOrNull(temp),
      systolic_bp: numberOrNull(sbp),
      complaint,
    });
  }

  return (
    <section className="flex flex-col gap-4">
      <header>
        <h2 className="section-title">{t.rulesTitle}</h2>
        <p className="mt-2 max-w-3xl rounded-md border border-amber bg-amber/10 px-3 py-2 text-sm font-semibold">
          {t.placeholderBanner}
        </p>
        <p className="mt-2 max-w-3xl text-sm">
          {t.rulesIntro}
          {rules.data?.note ? ` ${rules.data.note}` : ""}
        </p>
      </header>
      {rules.isPending ? <p role="status">{t.loading}</p> : null}
      {rules.isError ? <p role="alert">{rules.error.message}</p> : null}
      <div className="grid gap-3">
        {(rules.data?.rules ?? []).map((rule) => (
          <article key={rule.id} className="panel">
            <h2 className="font-semibold">{rule.id}</h2>
            <p className="text-sm">{rule.description}</p>
            <p className="mt-1 text-sm">{t.ruleMinLevel(rule.min_level)} {rule.reason}</p>
            {rule.when ? <p className="mt-1 text-xs">{t.ruleCondition} {JSON.stringify(rule.when)}</p> : null}
            <p className="mt-1 text-xs">{t.ruleReviewStatus(rule.clinically_reviewed)}</p>
          </article>
        ))}
      </div>
      <form className="panel" onSubmit={onSubmit}>
        <h2 className="font-semibold">{t.testRulesTitle}</h2>
        <p className="text-sm">{t.testRulesSub}</p>
        <div className="mt-2 grid gap-2 sm:grid-cols-3">
          <label className="text-sm font-semibold">{t.spo2}<input className="field mt-1 w-full" value={spo2} onChange={(event) => setSpo2(event.target.value)} /></label>
          <label className="text-sm font-semibold">{t.pulse}<input className="field mt-1 w-full" value={pulse} onChange={(event) => setPulse(event.target.value)} /></label>
          <label className="text-sm font-semibold">{t.temp}<input className="field mt-1 w-full" value={temp} onChange={(event) => setTemp(event.target.value)} /></label>
          <label className="text-sm font-semibold">{t.age}<input className="field mt-1 w-full" value={age} onChange={(event) => setAge(event.target.value)} /></label>
          <label className="text-sm font-semibold">{t.systolic}<input className="field mt-1 w-full" value={sbp} onChange={(event) => setSbp(event.target.value)} /></label>
          <label className="text-sm font-semibold sm:col-span-3">{t.colComplaint}<input className="field mt-1 w-full" value={complaint} onChange={(event) => setComplaint(event.target.value)} /></label>
        </div>
        <button type="submit" className="btn-primary mt-3">{t.runRules}</button>
        {check.isPending ? <p role="status">{t.loading}</p> : null}
        {check.isError ? <p role="alert">{check.error.message}</p> : null}
        {check.data ? (
          <div className="mt-3 text-sm">
            <p className="font-semibold">{check.data.banner}</p>
            <p>{check.data.note}</p>
            <p>{t.minLevelFromRules(check.data.rule_level ?? t.none)}</p>
            <ul className="mt-2 list-disc pl-5">
              {check.data.fired_rules.map((rule) => (
                <li key={rule.id}>{rule.id}: {rule.reason}</li>
              ))}
            </ul>
            {check.data.fired_rules.length === 0 ? <p>{t.noRuleFired}</p> : null}
          </div>
        ) : null}
      </form>
    </section>
  );
}
