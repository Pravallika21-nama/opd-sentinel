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
  ["systolic_bp", "systolic", "mmHg"],
  ["diastolic_bp", "diastolic", "mmHg"],
  ["pulse", "pulse", "bpm"],
  ["temperature_c", "temp", "°C"],
  ["spo2", "spo2", "%"],
] as const;

const sexOptions = [
  ["", "Not recorded"],
  ["female", "Female"],
  ["male", "Male"],
  ["other", "Other"],
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
  return "";
}

function statusOf(issues: FieldIssue[], field: string): string {
  return issues.find((issue) => issue.field === field)?.status ?? "";
}

function statusLabel(status: string): string {
  if (status === "ok") return "Valid";
  if (status === "missing") return "Missing";
  if (status === "implausible") return "Implausible";
  if (status === "conflicting") return "Conflicting";
  return "";
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
  const sexChoices = sexOptions.some(([value]) => value === form.sex)
    ? sexOptions
    : [...sexOptions, [form.sex, form.sex] as const];

  function clearAll() {
    setForm(empty);
    setBanner(null);
    setResult(null);
  }

  return (
    <div className="triage-layout">
      <form className="panel" onSubmit={onSubmit}>
        <h2 className="section-title">Patient intake</h2>
        <p className="section-sub">
          Leave a field blank if it was not measured. Entries are stored exactly as typed.
        </p>

        {demoMode && (demos.data?.cases ?? []).length > 0 ? (
          <div className="mt-4 rounded-xl bg-sky-50 px-4 py-3">
            <p className="text-sm font-semibold text-sky-900">Try an example (not a real patient)</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(demos.data?.cases ?? []).map((item) => (
                <button key={item.id} type="button" className="chip" onClick={() => fill(item.intake)}>
                  {item.title}
                </button>
              ))}
            </div>
          </div>
        ) : null}
        {banner ? <p className="notice mt-3">{banner}</p> : null}

        <fieldset className="form-section">
          <legend className="form-section-title">Patient</legend>
          <div className="field-grid">
            <label className="field-label">
              {t.sex}
              <select className="field" value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })}>
                {sexChoices.map(([value, label]) => (
                  <option key={value || "none"} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field-label">
              {t.age}
              <input className="field" inputMode="decimal" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} />
            </label>
          </div>
          <p className="mt-2 text-xs text-slate-500">The OPD number is assigned when the case is stored.</p>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">Vital signs</legend>
          <div className="field-grid is-vitals">
            {vitalNames.map(([name, label, unit]) => {
              const reported = statusOf(issues, name);
              const status = reported || (result && form[name].trim() ? "ok" : "");
              const typedHint = hint(name, form[name], ranges.data);
              const message = status ? statusLabel(status) : typedHint;
              const tone = status === "implausible" || status === "conflicting"
                ? "is-alert"
                : status === "ok" ? "" : "is-hint";
              return (
                <div key={name}>
                  <label className="field-label" htmlFor={name}>
                    {t[label]}
                    <span className="input-unit">
                      <input
                        id={name}
                        className="field"
                        inputMode="decimal"
                        value={form[name]}
                        aria-describedby={message ? `${name}-status` : undefined}
                        onChange={(event) => setForm({ ...form, [name]: event.target.value })}
                      />
                      <span aria-hidden="true">{unit}</span>
                    </span>
                  </label>
                  {message ? (
                    <p id={`${name}-status`} className={`status-note ${tone}`}>
                      {message}
                      {status && typedHint ? `. ${typedHint}` : ""}
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">Complaint and history</legend>
          <label className="field-label mt-3" htmlFor="complaint">
            {t.complaint}
            <textarea
              id="complaint"
              className="field min-h-20"
              value={form.complaint}
              placeholder="As the patient speaks, in any language"
              onChange={(event) => setForm({ ...form, complaint: event.target.value })}
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">
            Any script is accepted. For example: chest pain, seene mein dard, gunde noppi.
          </p>
          <div className="field-grid">
            <label className="field-label">
              {t.conditions}
              <input className="field" value={form.known_conditions} onChange={(event) => setForm({ ...form, known_conditions: event.target.value })} />
            </label>
            <label className="field-label">
              {t.medications}
              <input className="field" value={form.medications} onChange={(event) => setForm({ ...form, medications: event.target.value })} />
            </label>
          </div>
        </fieldset>

        <div className="form-section flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">The result is a suggestion. It is not a confirmed decision.</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={clearAll}>
              {t.clear}
            </button>
            <button type="submit" className="btn-primary px-6" disabled={submit.isPending}>
              {submit.isPending ? t.loading : t.assess}
            </button>
          </div>
        </div>
        {submit.isError ? <p role="alert" className="mt-2 text-sm text-alert">{submit.error.message}</p> : null}
      </form>

      <aside className={result ? "triage-side" : "triage-side is-sticky"} aria-live="polite">
        {result ? (
          <>
            <section className="panel min-w-0">
              <p className="topbar-kicker">Suggestion, not a decision</p>
              {result.opd_number ? <p className="opd-number mt-1">{result.opd_number}</p> : null}
              {result.case_id ? <p className="text-xs text-slate-500">Internal encounter ID: {result.case_id}</p> : null}
              <div className="mt-4">
                <ResultCard result={result} />
              </div>
            </section>
            {result.case_id ? (
              <NurseActions
                caseId={result.case_id}
                suggestedLevel={result.triage_level}
                department={result.department}
                abstain={result.abstain}
              />
            ) : null}
          </>
        ) : (
          <section className="panel">
            <h2 className="section-title">How this works</h2>
            <ol className="steps">
              <li className="step">
                <span className="step-num">1</span>
                <div>
                  <p className="font-semibold">Enter what you have</p>
                  <p className="text-sm text-slate-600">Vitals and the complaint in the patient's own words. Blank fields are fine.</p>
                </div>
              </li>
              <li className="step">
                <span className="step-num">2</span>
                <div>
                  <p className="font-semibold">OPD Sentinel checks it</p>
                  <p className="text-sm text-slate-600">It flags unusual vitals, applies the safety rules, and suggests a triage level and department.</p>
                </div>
              </li>
              <li className="step">
                <span className="step-num">3</span>
                <div>
                  <p className="font-semibold">You decide</p>
                  <p className="text-sm text-slate-600">Confirm, override, or escalate. Every action is written to the audit log.</p>
                </div>
              </li>
            </ol>
            <p className="callout mt-4 text-sm">
              Safety rules can only raise urgency. If the input cannot be assessed, you will see
              "Cannot assess, send to nurse now".
            </p>
          </section>
        )}
      </aside>
    </div>
  );
}
