import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ApiError, apiGet, apiPost, type FieldIssue, type TriageResult } from "../api/client";
import { NurseActions } from "../components/NurseActions";
import { ResultCard, fieldLabel } from "../components/ResultCard";
import { fieldStatusName, useLocale, type Copy } from "../lib/i18n";

type Ranges = {
  fields: Record<string, { min: number; max: number; unit: string }>;
  temperature_unit: { fahrenheit_min: number; fahrenheit_max: number };
};

type DemoFile = {
  banner: string;
  cases: { id: string; title: string; intake: Record<string, unknown> }[];
};

const empty = {
  patient_ref: "",
  patient_name: "",
  arrival_time: "",
  nurse_notes: "",
  uncertain_information: "",
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
  ["", "sexNotRecorded"],
  ["female", "sexFemale"],
  ["male", "sexMale"],
  ["other", "sexOther"],
] as const;

function hint(name: string, raw: string, ranges: Ranges | undefined, t: Copy): string {
  if (!ranges || raw.trim() === "") return "";
  const value = Number(raw);
  if (Number.isNaN(value)) return t.hintNotNumber;
  const spec = ranges.fields[name];
  if (!spec) return "";
  if (name === "temperature_c" && value >= ranges.temperature_unit.fahrenheit_min && value > spec.max) {
    return t.hintFahrenheit;
  }
  if (value < spec.min || value > spec.max) return t.hintOutside(spec.min, spec.max);
  return "";
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
    const arrival = form.arrival_time ? new Date(form.arrival_time) : null;
    submit.mutate({
      patient_ref: form.patient_ref,
      patient_name: form.patient_name,
      arrival_time: arrival && !Number.isNaN(arrival.getTime()) ? arrival.toISOString() : null,
      nurse_notes: form.nurse_notes,
      uncertain_information: form.uncertain_information,
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
    setBanner(demos.data?.banner ?? t.exampleOutcome);
    setResult(null);
    setForm({
      ...empty,
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
  const knownSexChoices = sexOptions.map(([value, key]) => [value, t[key]] as const);
  const sexChoices = sexOptions.some(([value]) => value === form.sex)
    ? knownSexChoices
    : [...knownSexChoices, [form.sex, form.sex] as const];

  function clearAll() {
    setForm(empty);
    setBanner(null);
    setResult(null);
    submit.reset();
  }

  return (
    <div className="triage-layout">
      <form className="panel" onSubmit={onSubmit}>
        <h2 className="section-title">{t.registrationTitle}</h2>
        <p className="section-sub">
          {t.registrationSub} {t.patientIntakeSub}
        </p>

        {demoMode && (demos.data?.cases ?? []).length > 0 ? (
          <div className="mt-4 rounded-xl bg-sky-50 px-4 py-3">
            <p className="text-sm font-semibold text-sky-900">{t.tryExample}</p>
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
          <legend className="form-section-title">{t.patient}</legend>
          <div className="field-grid">
            <label className="field-label">
              {t.patientRef}
              <input
                className="field"
                maxLength={64}
                autoComplete="off"
                value={form.patient_ref}
                aria-describedby="patient-ref-hint"
                onChange={(event) => setForm({ ...form, patient_ref: event.target.value })}
              />
              <span id="patient-ref-hint" className="text-xs font-normal text-slate-500">
                {t.patientRefHint}
              </span>
            </label>
            <label className="field-label">
              {t.patientName}
              <input
                className="field"
                maxLength={120}
                autoComplete="off"
                value={form.patient_name}
                onChange={(event) => setForm({ ...form, patient_name: event.target.value })}
              />
            </label>
            <label className="field-label">
              {t.arrivalTime}
              <input
                className="field"
                type="datetime-local"
                value={form.arrival_time}
                aria-describedby="arrival-hint"
                onChange={(event) => setForm({ ...form, arrival_time: event.target.value })}
              />
              <span id="arrival-hint" className="text-xs font-normal text-slate-500">
                {t.arrivalHint}
              </span>
            </label>
          </div>
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
          <p className="mt-2 text-xs text-slate-500">{t.opdAssigned}</p>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">{t.vitalSigns}</legend>
          <div className="field-grid is-vitals">
            {vitalNames.map(([name, label, unit]) => {
              const reported = statusOf(issues, name);
              const status = reported || (result && form[name].trim() ? "ok" : "");
              const typedHint = hint(name, form[name], ranges.data, t);
              const message = status ? fieldStatusName(t, status) : typedHint;
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
          <legend className="form-section-title">{t.complaintHistory}</legend>
          <label className="field-label mt-3" htmlFor="complaint">
            {t.complaint}
            <textarea
              id="complaint"
              className="field min-h-20"
              value={form.complaint}
              placeholder={t.complaintPlaceholder}
              onChange={(event) => setForm({ ...form, complaint: event.target.value })}
            />
          </label>
          <p className="mt-1 text-xs text-slate-500">{t.complaintScripts}</p>
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
          <div className="field-grid">
            <label className="field-label">
              {t.nurseNotes}
              <textarea
                className="field min-h-20"
                maxLength={2000}
                value={form.nurse_notes}
                onChange={(event) => setForm({ ...form, nurse_notes: event.target.value })}
              />
            </label>
            <label className="field-label">
              {t.uncertainInfo}
              <textarea
                className="field min-h-20"
                maxLength={1000}
                value={form.uncertain_information}
                placeholder={t.uncertainPlaceholder}
                onChange={(event) => setForm({ ...form, uncertain_information: event.target.value })}
              />
            </label>
          </div>
        </fieldset>

        <div className="form-section flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-slate-500">{t.suggestionNote}</p>
          <div className="flex gap-2">
            <button type="button" className="btn-secondary" onClick={clearAll}>
              {t.clear}
            </button>
            <button type="submit" className="btn-primary px-6" disabled={submit.isPending || result !== null}>
              {submit.isPending ? t.loading : t.registerAssess}
            </button>
          </div>
        </div>
        {submit.isError ? (
          <div role="alert" className="error-note mt-2">
            <p>{t.registrationFailed}</p>
            <p className="font-normal">{submit.error.message}</p>
            {submit.error instanceof ApiError && submit.error.fieldErrors.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 font-normal">
                {submit.error.fieldErrors.map((item) => (
                  <li key={`${item.field}-${item.message}`}>
                    {fieldLabel(t, item.field)}: {item.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}
      </form>

      <aside className={result ? "triage-side" : "triage-side is-sticky"} aria-live="polite">
        {result ? (
          <>
            {result.opd_number ? (
              <section className="opd-hero" aria-label={t.opdIssued}>
                <p className="topbar-kicker">{t.opdIssued}</p>
                <p className="opd-hero__number">{result.opd_number}</p>
                <p className="text-sm text-slate-700">{t.opdTellPatient}</p>
                {result.case_id ? <p className="mt-1 text-xs text-slate-500">{t.internalId(result.case_id)}</p> : null}
                <button type="button" className="btn-secondary mt-3" onClick={clearAll}>
                  {t.newRegistration}
                </button>
              </section>
            ) : null}
            <section className="panel min-w-0">
              <div>
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
            <h2 className="section-title">{t.howItWorks}</h2>
            <ol className="steps">
              <li className="step">
                <span className="step-num">1</span>
                <div>
                  <p className="font-semibold">{t.step1Title}</p>
                  <p className="text-sm text-slate-600">{t.step1Body}</p>
                </div>
              </li>
              <li className="step">
                <span className="step-num">2</span>
                <div>
                  <p className="font-semibold">{t.step2Title}</p>
                  <p className="text-sm text-slate-600">{t.step2Body}</p>
                </div>
              </li>
              <li className="step">
                <span className="step-num">3</span>
                <div>
                  <p className="font-semibold">{t.step3Title}</p>
                  <p className="text-sm text-slate-600">{t.step3Body}</p>
                </div>
              </li>
            </ol>
            <p className="callout mt-4 text-sm">{t.howCallout(t.cannotAssess)}</p>
          </section>
        )}
      </aside>
    </div>
  );
}
