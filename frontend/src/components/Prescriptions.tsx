import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiPost, fieldErrorFor, type Encounter, type Prescription } from "../api/client";
import { useLocale } from "../lib/i18n";
import { formatDateTime } from "../lib/workflow";
import { refreshEncounterViews } from "./NurseActions";

const routes = [
  "oral",
  "sublingual",
  "topical",
  "inhaled",
  "intravenous",
  "intramuscular",
  "subcutaneous",
  "rectal",
  "ophthalmic",
  "otic",
  "nasal",
  "other",
] as const;

const blank = { medication: "", dose: "", dose_unit: "mg", route: "oral", frequency: "", duration: "", instructions: "" };

export function PrescriptionList({ encounter, canCancel = false }: { encounter: Encounter; canCancel?: boolean }) {
  const { t, locale } = useLocale();
  const client = useQueryClient();
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const cancel = useMutation({
    mutationFn: (item: Prescription) => apiPost(`/prescriptions/${item.id}/status`, { action: "cancel", reason }),
    onSuccess: async () => {
      setCancelling(null);
      setReason("");
      await refreshEncounterViews(client, encounter.case_id);
    },
  });
  const locked = encounter.consultation_status === "completed";

  return (
    <section className="panel">
      <h3 className="section-title">{t.prescriptionsTitle}</h3>
      {encounter.prescriptions.length === 0 ? <p className="mt-1 text-sm">{t.noPrescriptions}</p> : null}
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {encounter.prescriptions.map((item) => (
          <li
            key={item.id}
            className={`rounded-md border border-line px-3 py-2 ${item.status === "cancelled" ? "opacity-70" : ""}`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className={`font-semibold ${item.status === "cancelled" ? "line-through" : ""}`}>
                {item.medication} {item.dose} {item.dose_unit} · {t.routeNames[item.route] ?? item.route} · {item.frequency} ·{" "}
                {item.duration}
              </p>
              <span className={`pill ${item.status === "active" ? "pill-ok" : "pill-slate"}`}>
                {item.status === "active" ? t.rxActive : t.rxCancelled}
              </span>
            </div>
            {item.instructions ? <p className="mt-1">{item.instructions}</p> : null}
            <p className="mt-1 text-xs text-slate-500">{t.rxBy(item.prescriber_name, formatDateTime(locale, item.created_at))}</p>
            {item.status === "cancelled" && item.status_reason ? (
              <p className="text-xs text-slate-500">
                {t.rxCancelled} {formatDateTime(locale, item.status_changed_at)}: {item.status_reason}
              </p>
            ) : null}
            {canCancel && !locked && item.status === "active" ? (
              cancelling === item.id ? (
                <div className="mt-2 flex flex-wrap items-end gap-2">
                  <label className="field-label grow">
                    {t.rxCancelReason}
                    <input className="field" value={reason} maxLength={1000} onChange={(event) => setReason(event.target.value)} />
                  </label>
                  <button
                    type="button"
                    className="btn-alert"
                    disabled={reason.trim().length < 3 || cancel.isPending}
                    onClick={() => cancel.mutate(item)}
                  >
                    {t.rxCancel}
                  </button>
                  <button type="button" className="btn-secondary" onClick={() => setCancelling(null)}>
                    {t.rxKeep}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  className="btn-secondary mt-2"
                  onClick={() => {
                    setCancelling(item.id);
                    setReason("");
                  }}
                >
                  {t.rxCancel}
                </button>
              )
            ) : null}
          </li>
        ))}
      </ul>
      {cancel.isError ? (
        <p role="alert" className="error-note mt-2">
          {cancel.error.message}
        </p>
      ) : null}
    </section>
  );
}

export function PrescriptionForm({ encounter }: { encounter: Encounter }) {
  const { t } = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState(blank);
  const [saved, setSaved] = useState(false);
  const add = useMutation({
    mutationFn: () => apiPost(`/encounters/${encounter.case_id}/prescriptions`, form),
    onSuccess: async () => {
      setForm(blank);
      setSaved(true);
      await refreshEncounterViews(client, encounter.case_id);
    },
  });

  const doseValue = Number(form.dose);
  const doseBad = form.dose.trim() !== "" && !(Number.isFinite(doseValue) && doseValue > 0);
  const ready =
    form.medication.trim().length >= 2 &&
    form.dose.trim() !== "" &&
    !doseBad &&
    form.dose_unit.trim() !== "" &&
    form.frequency.trim() !== "" &&
    form.duration.trim() !== "";

  function submit(event: FormEvent) {
    event.preventDefault();
    setSaved(false);
    add.mutate();
  }

  function input(name: keyof typeof blank, label: string, extra: { maxLength: number; required?: boolean; inputMode?: "decimal" }) {
    const serverError = fieldErrorFor(add.error, name);
    return (
      <label className="field-label">
        {label}
        <input
          className="field"
          value={form[name]}
          maxLength={extra.maxLength}
          required={extra.required}
          inputMode={extra.inputMode}
          aria-invalid={serverError || (name === "dose" && doseBad) ? true : undefined}
          onChange={(event) => setForm({ ...form, [name]: event.target.value })}
        />
        {name === "dose" && doseBad ? <span className="form-error">{t.doseNumber}</span> : null}
        {serverError ? <span className="form-error">{serverError}</span> : null}
      </label>
    );
  }

  return (
    <form className="panel" onSubmit={submit} aria-label={t.rxTitle}>
      <h3 className="section-title">{t.rxTitle}</h3>
      <p className="section-sub">{t.rxSub}</p>
      <div className="field-grid">
        {input("medication", t.rxMedication, { maxLength: 200, required: true })}
        {input("dose", t.rxDose, { maxLength: 40, required: true, inputMode: "decimal" })}
        {input("dose_unit", t.rxUnit, { maxLength: 20, required: true })}
        <label className="field-label">
          {t.rxRoute}
          <select className="field" value={form.route} onChange={(event) => setForm({ ...form, route: event.target.value })}>
            {routes.map((route) => (
              <option key={route} value={route}>
                {t.routeNames[route]}
              </option>
            ))}
          </select>
        </label>
        {input("frequency", t.rxFrequency, { maxLength: 80, required: true })}
        {input("duration", t.rxDuration, { maxLength: 80, required: true })}
      </div>
      <label className="field-label mt-3">
        {t.rxInstructions}
        <textarea
          className="field min-h-16"
          maxLength={1000}
          value={form.instructions}
          onChange={(event) => setForm({ ...form, instructions: event.target.value })}
        />
      </label>
      <button type="submit" className="btn-primary mt-3" disabled={!ready || add.isPending}>
        {add.isPending ? t.loading : t.rxAdd}
      </button>
      {add.isError ? (
        <p role="alert" className="error-note mt-2">
          {add.error.message}
        </p>
      ) : null}
      {saved && !add.isError ? (
        <p role="status" className="success-note mt-2">
          {t.rxAdded}
        </p>
      ) : null}
    </form>
  );
}
