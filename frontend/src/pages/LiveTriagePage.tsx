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
  ["pulse", "pulse", "bpm"],
  ["temperature_c", "temp", "°C"],
  ["spo2", "spo2", "%"],
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

  return (
    <div className="triage-workspace">
      <form className="panel" onSubmit={onSubmit}>
        <h1 className="text-lg font-semibold">{t.live}</h1>
        <p className="mt-1 text-sm">
          Missing fields can be left blank. The original entry is kept. The complaint is stored as typed.
        </p>
        {banner ? <p className="mt-2 rounded-md border border-amber bg-amber/10 px-3 py-2 text-sm font-semibold">{banner}</p> : null}
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Patient / encounter</legend>
          <p className="text-xs">The OPD number is assigned by the server when this case is stored.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-sm font-semibold">
              {t.sex}
              <input className="field mt-1 w-full" value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })} />
            </label>
            <label className="text-sm font-semibold">
              {t.age}
              <input className="field mt-1 w-full" inputMode="decimal" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} />
            </label>
          </div>
        </fieldset>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Vital signs</legend>
          <p className="text-xs">Blank is allowed. The original entry is kept.</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-sm font-semibold" htmlFor="systolic_bp">
              {t.systolic} (mmHg)
              <input id="systolic_bp" className="field mt-1 w-full" inputMode="decimal" value={form.systolic_bp} onChange={(event) => setForm({ ...form, systolic_bp: event.target.value })} />
            </label>
            <label className="text-sm font-semibold" htmlFor="diastolic_bp">
              {t.diastolic} (mmHg)
              <input id="diastolic_bp" className="field mt-1 w-full" inputMode="decimal" value={form.diastolic_bp} onChange={(event) => setForm({ ...form, diastolic_bp: event.target.value })} />
            </label>
          </div>
          {vitalNames.map(([name, label, unit]) => {
            const reported = statusOf(issues, name);
            const status = reported || (result && form[name].trim() ? "ok" : "");
            const typedHint = hint(name, form[name], ranges.data);
            const message = status ? statusLabel(status) : typedHint;
            return (
              <div key={name}>
                <label className="text-sm font-semibold" htmlFor={name}>
                  {t[label]} ({unit})
                </label>
                <input
                  id={name}
                  className="field mt-1 w-full"
                  inputMode="decimal"
                  value={form[name]}
                  aria-describedby={message ? `${name}-status` : undefined}
                  onChange={(event) => setForm({ ...form, [name]: event.target.value })}
                />
                {message ? (
                  <p
                    id={`${name}-status`}
                    className={`status-note ${status === "implausible" || status === "conflicting" ? "is-alert" : ""}`}
                  >
                    {message}
                    {status && typedHint ? `. ${typedHint}` : ""}
                  </p>
                ) : null}
              </div>
            );
          })}
        </fieldset>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">Complaint and history</legend>
          <div className="mt-2">
          <label className="flex flex-col gap-1 text-sm font-semibold" htmlFor="complaint">
            {t.complaint}
            <input
              id="complaint"
              className="field"
              value={form.complaint}
              placeholder="As the patient speaks"
              onChange={(event) => setForm({ ...form, complaint: event.target.value })}
            />
          </label>
          <p className="mt-1 text-xs font-normal">
            Any script is accepted. Examples: chest pain, seene mein dard, gunde noppi.
          </p>
        </div>
        <label className="mt-2 flex flex-col gap-1 text-sm font-semibold">
          {t.conditions}
          <input className="field" value={form.known_conditions} onChange={(event) => setForm({ ...form, known_conditions: event.target.value })} />
        </label>
        <label className="mt-2 flex flex-col gap-1 text-sm font-semibold">
          {t.medications}
          <input className="field" value={form.medications} onChange={(event) => setForm({ ...form, medications: event.target.value })} />
        </label>
        </fieldset>
        <div className="mt-3 flex flex-col gap-2">
          <button type="submit" className="btn-primary w-full">{t.assess}</button>
          <button
            type="button"
            className="btn-secondary w-full"
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
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold">{t.examples}</summary>
            <p className="text-xs">Example, not a real clinical outcome.</p>
            <div className="mt-2 flex flex-col gap-1">
              {(demos.data?.cases ?? []).map((item) => (
                <button key={item.id} type="button" className="btn-secondary text-left" onClick={() => fill(item.intake)}>
                  {item.title}
                </button>
              ))}
            </div>
          </details>
        ) : null}
      </form>

      <section className="panel min-w-0" aria-live="polite">
        <h2 className="text-lg font-semibold">Assessment and safety review</h2>
        <p className="text-sm">This is the model and Safety-Rule recommendation. It is not a nurse-confirmed decision.</p>
        {result?.opd_number ? <p className="mt-2 text-2xl font-semibold">{result.opd_number}</p> : null}
        {result?.case_id ? (
          <p className="text-sm">Internal encounter ID: {result.case_id}</p>
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
