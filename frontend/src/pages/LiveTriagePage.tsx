import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { apiGet, apiPost, type FieldIssue, type TriageResult } from "../api/client";
import { NurseActions } from "../components/NurseActions";
import { ResultCard } from "../components/ResultCard";
import { useLocale } from "../lib/i18n";

type Ranges = {
  fields: Record<string, { min: number; max: number; unit: string }>;
  temperature_unit: { fahrenheit_min: number; fahrenheit_max: number };
};

type DemoFile = {
  banner: string;
  cases: { id: string; title: string; intake: Record<string, unknown> }[];
};

const empty = {
  age: "",
  sex: "",
  systolic_bp: "",
  diastolic_bp: "",
  pulse: "",
  temperature_c: "",
  spo2: "",
  complaint: "",
  known_conditions: "",
  medications: "",
};

const vitalNames = [
  ["systolic_bp", "systolic"],
  ["diastolic_bp", "diastolic"],
  ["pulse", "pulse"],
  ["temperature_c", "temp"],
  ["spo2", "spo2"],
] as const;

function hint(name: string, raw: string, ranges: Ranges | undefined): string {
  if (!ranges || raw.trim() === "") return "";
  const value = Number(raw);
  if (Number.isNaN(value)) return "Not a number. It will be kept.";
  const spec = ranges.fields[name];
  if (!spec) return "";
  if (name === "temperature_c" && value >= ranges.temperature_unit.fahrenheit_min && value > spec.max) {
    return "Looks like Fahrenheit. It will be flagged, not converted.";
  }
  if (value < spec.min || value > spec.max) return `Outside placeholder range ${spec.min}–${spec.max}.`;
  return "Within the placeholder range.";
}

function statusOf(issues: FieldIssue[], field: string): string {
  return issues.find((issue) => issue.field === field)?.status ?? "";
}

export function LiveTriagePage() {
  const { t, demoMode } = useLocale();
  const [form, setForm] = useState(empty);
  const [banner, setBanner] = useState<string | null>(null);
  const [result, setResult] = useState<TriageResult | null>(null);
  const ranges = useQuery({ queryKey: ["ranges"], queryFn: () => apiGet<Ranges>("/validation-ranges") });
  const demos = useQuery({
    queryKey: ["demos"],
    queryFn: () => apiGet<DemoFile>("/demo/cases"),
    enabled: demoMode,
  });
  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<TriageResult>("/triage", body),
    onSuccess: (next) => setResult(next),
  });

  function numberOrNull(value: string) {
    return value.trim() === "" ? null : Number(value);
  }

  function onSubmit(event: FormEvent) {
    event.preventDefault();
    submit.mutate({
      age: numberOrNull(form.age),
      sex: form.sex || null,
      systolic_bp: numberOrNull(form.systolic_bp),
      diastolic_bp: numberOrNull(form.diastolic_bp),
      pulse: numberOrNull(form.pulse),
      temperature_c: numberOrNull(form.temperature_c),
      spo2: numberOrNull(form.spo2),
      complaint: form.complaint,
      known_conditions: form.known_conditions,
      medications: form.medications,
      illustrative: banner !== null,
    });
  }

  function fill(intake: Record<string, unknown>) {
    setBanner(demos.data?.banner ?? "Example, not a real clinical outcome");
    setResult(null);
    setForm({
      age: intake.age == null ? "" : String(intake.age),
      sex: intake.sex == null ? "" : String(intake.sex),
      systolic_bp: intake.systolic_bp == null ? "" : String(intake.systolic_bp),
      diastolic_bp: intake.diastolic_bp == null ? "" : String(intake.diastolic_bp),
      pulse: intake.pulse == null ? "" : String(intake.pulse),
      temperature_c: intake.temperature_c == null ? "" : String(intake.temperature_c),
      spo2: intake.spo2 == null ? "" : String(intake.spo2),
      complaint: intake.complaint == null ? "" : String(intake.complaint),
      known_conditions: intake.known_conditions == null ? "" : String(intake.known_conditions),
      medications: intake.medications == null ? "" : String(intake.medications),
    });
  }

  const issues = result?.validation_issues ?? [];

  return (
    <div className="grid gap-4 xl:grid-cols-[20rem_minmax(0,1fr)_18rem]">
      <form className="panel" onSubmit={onSubmit}>
        <h1 className="text-lg font-semibold">{t.live}</h1>
        <p className="mt-1 text-sm">
          Missing fields can be left blank. The original entry is kept. The complaint is stored as typed.
        </p>
        {banner ? <p className="mt-2 rounded-md border border-amber bg-amber/10 px-3 py-2 text-sm font-semibold">{banner}</p> : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-sm font-semibold">
            {t.sex}
            <input className="field mt-1 w-full" value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })} />
          </label>
          <label className="text-sm font-semibold">
            {t.age}
            <input className="field mt-1 w-full" inputMode="decimal" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} />
          </label>
        </div>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {vitalNames.map(([name, label]) => {
            const status = statusOf(issues, name);
            return (
              <label key={name} className="text-sm font-semibold">
                {t[label]}
                <input
                  className="field mt-1 w-full"
                  inputMode="decimal"
                  value={form[name]}
                  onChange={(event) => setForm({ ...form, [name]: event.target.value })}
                />
                <span className={`mt-1 block text-xs font-medium ${status === "ok" || status === "" ? "text-ink" : "text-alert"}`}>
                  {status ? status : hint(name, form[name], ranges.data) || "Blank is allowed."}
                </span>
              </label>
            );
          })}
        </div>
        <label className="mt-2 flex flex-col gap-1 text-sm font-semibold">
          {t.complaint}
          <input
            className="field"
            value={form.complaint}
            placeholder="chest pain / seene mein dard / గుండె నొప్పి"
            onChange={(event) => setForm({ ...form, complaint: event.target.value })}
          />
        </label>
        <label className="mt-2 flex flex-col gap-1 text-sm font-semibold">
          {t.conditions}
          <input className="field" value={form.known_conditions} onChange={(event) => setForm({ ...form, known_conditions: event.target.value })} />
        </label>
        <label className="mt-2 flex flex-col gap-1 text-sm font-semibold">
          {t.medications}
          <input className="field" value={form.medications} onChange={(event) => setForm({ ...form, medications: event.target.value })} />
        </label>
        <div className="mt-3 flex gap-2">
          <button type="submit" className="btn-primary">{t.assess}</button>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setForm(empty);
              setBanner(null);
              setResult(null);
            }}
          >
            {t.clear}
          </button>
        </div>
        {submit.isPending ? <p role="status">{t.loading}</p> : null}
        {submit.isError ? <p role="alert">{submit.error.message}</p> : null}
        {demoMode ? (
          <section className="mt-4" aria-label={t.examples}>
            <h2 className="text-sm font-semibold">{t.examples}</h2>
            <p className="text-xs">Example, not a real clinical outcome.</p>
            <div className="mt-2 flex flex-col gap-1">
              {(demos.data?.cases ?? []).map((item) => (
                <button key={item.id} type="button" className="btn-secondary text-left" onClick={() => fill(item.intake)}>
                  {item.title}
                </button>
              ))}
            </div>
          </section>
        ) : null}
      </form>

      <section className="panel min-w-0" aria-live="polite">
        <h2 className="text-lg font-semibold">Assessment</h2>
        {result?.case_id ? (
          <p className="mt-1 text-sm">
            <span className="font-semibold">{t.encounter}: </span>
            {result.case_id}
          </p>
        ) : (
          <p className="mt-2 text-sm">The result appears here after submit.</p>
        )}
        {result ? <div className="mt-3"><ResultCard result={result} /></div> : null}
      </section>

      <div>
        {result?.case_id ? (
          <NurseActions
            caseId={result.case_id}
            suggestedLevel={result.triage_level}
            department={result.department}
            abstain={result.abstain}
          />
        ) : (
          <section className="panel">
            <h2 className="text-base font-semibold">{t.actions}</h2>
            <p className="mt-2 text-sm">Confirm, override, escalate, or request reassessment after an assessment.</p>
          </section>
        )}
      </div>
    </div>
  );
}
