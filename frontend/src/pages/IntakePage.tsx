import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { apiGet, apiPost, type TriageResult } from "../api/client";
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

function hint(name: string, raw: string, ranges: Ranges | undefined): string {
  if (!ranges || raw.trim() === "") return "";
  const value = Number(raw);
  if (Number.isNaN(value)) return "Not a number.";
  const spec = ranges.fields[name];
  if (!spec) return "";
  if (name === "temperature_c" && value >= ranges.temperature_unit.fahrenheit_min && value > spec.max) {
    return "Looks like Fahrenheit. It will be flagged, not converted.";
  }
  if (value < spec.min || value > spec.max) return `Outside placeholder range ${spec.min}–${spec.max}.`;
  return "";
}

export function IntakePage({ onOpenCase }: { onOpenCase: (id: string) => void }) {
  const { t } = useLocale();
  const [form, setForm] = useState(empty);
  const [banner, setBanner] = useState<string | null>(null);
  const ranges = useQuery({ queryKey: ["ranges"], queryFn: () => apiGet<Ranges>("/validation-ranges") });
  const demos = useQuery({ queryKey: ["demos"], queryFn: () => apiGet<DemoFile>("/demo/cases") });
  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<TriageResult>("/triage", body),
    onSuccess: (result) => {
      if (result.case_id) onOpenCase(result.case_id);
    },
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

  const fields: { key: keyof typeof empty; label: string; rangeKey?: string }[] = [
    { key: "age", label: t.age, rangeKey: "age" },
    { key: "systolic_bp", label: t.systolic, rangeKey: "systolic_bp" },
    { key: "diastolic_bp", label: t.diastolic, rangeKey: "diastolic_bp" },
    { key: "pulse", label: t.pulse, rangeKey: "pulse" },
    { key: "temperature_c", label: t.temp, rangeKey: "temperature_c" },
    { key: "spo2", label: t.spo2, rangeKey: "spo2" },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <form className="flex flex-col gap-4" onSubmit={onSubmit}>
        <h1 className="text-3xl font-semibold">{t.intake}</h1>
        <p>A nurse confirms every case. This tool does not diagnose.</p>
        {banner ? <p className="rounded-md border border-line bg-card px-3 py-2 font-semibold">{banner}</p> : null}
        <label className="flex flex-col gap-1 font-semibold">
          {t.sex}
          <input
            className="field"
            value={form.sex}
            onChange={(event) => setForm({ ...form, sex: event.target.value })}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          {fields.map((field) => {
            const message = field.rangeKey ? hint(field.rangeKey, form[field.key], ranges.data) : "";
            return (
              <label key={field.key} className="flex flex-col gap-1 font-semibold">
                {field.label}
                <input
                  className="field"
                  inputMode="decimal"
                  value={form[field.key]}
                  onChange={(event) => setForm({ ...form, [field.key]: event.target.value })}
                  aria-invalid={message !== ""}
                />
                {message ? <span className="text-sm font-normal text-alert">{message}</span> : null}
              </label>
            );
          })}
        </div>
        <label className="flex flex-col gap-1 font-semibold">
          {t.complaint}
          <input
            className="field"
            value={form.complaint}
            placeholder="chest pain / seene mein dard / గుండె నొప్పి"
            onChange={(event) => setForm({ ...form, complaint: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          {t.conditions}
          <input
            className="field"
            value={form.known_conditions}
            onChange={(event) => setForm({ ...form, known_conditions: event.target.value })}
          />
        </label>
        <label className="flex flex-col gap-1 font-semibold">
          {t.medications}
          <input
            className="field"
            value={form.medications}
            onChange={(event) => setForm({ ...form, medications: event.target.value })}
          />
        </label>
        <p className="text-sm">{t.submitHint}</p>
        <button type="submit" className="min-h-12 rounded-md bg-teal px-4 text-lg font-semibold text-white">
          {t.submit}
        </button>
        {submit.isPending ? <p role="status">{t.loading}</p> : null}
        {submit.isError ? <p role="alert">{submit.error.message}</p> : null}
        <section aria-label={t.examples}>
          <h2 className="text-lg font-semibold">{t.examples}</h2>
          <div className="mt-2 flex flex-col gap-2">
            {(demos.data?.cases ?? []).map((item) => (
              <button
                key={item.id}
                type="button"
                className="min-h-11 rounded-md border border-line bg-card px-3 text-left"
                onClick={() => fill(item.intake)}
              >
                {item.title}
              </button>
            ))}
          </div>
        </section>
      </form>
      <section className="rounded-lg border border-line bg-card p-4">
        {submit.data ? <ResultCard result={submit.data} /> : <p>The result appears here after submit.</p>}
      </section>
    </div>
  );
}
