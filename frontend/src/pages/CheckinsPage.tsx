import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ApiError, apiGet, apiPost, type Checkin, type TriageResult } from "../api/client";
import { NurseActions } from "../components/NurseActions";
import { ResultCard, fieldLabel } from "../components/ResultCard";
import { SelfReportPanel } from "../components/SelfReport";
import { EmptyState, LiveBadge, PageHero, Skeleton } from "../components/ui";
import { useLocale, type Copy } from "../lib/i18n";

type Registered = { checkin: Checkin; triage: TriageResult };

const vitals = [
  ["systolic_bp", "systolic", "mmHg", "self_systolic_bp"],
  ["diastolic_bp", "diastolic", "mmHg", "self_diastolic_bp"],
  ["pulse", "pulse", "bpm", "self_pulse"],
  ["temperature_c", "temp", "°C", "self_temperature_c"],
  ["spo2", "spo2", "%", "self_spo2"],
] as const;

type VitalKey = (typeof vitals)[number][0];

const sexOptions = [
  ["", "sexNotRecorded"],
  ["female", "sexFemale"],
  ["male", "sexMale"],
  ["other", "sexOther"],
] as const;

function selfNotes(item: Checkin): string {
  return [
    item.symptom_duration ? `Duration (self-reported): ${item.symptom_duration}` : "",
    item.severity !== null ? `Severity (self-reported): ${item.severity}/10` : "",
    item.allergies ? `Allergies (self-reported): ${item.allergies}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

function waitedMinutes(iso: string): number {
  return Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
}

function statusPill(t: Copy, item: Checkin): [string, string] {
  if (item.status === "registered") return ["pill-ok", t.pStRegistered];
  if (item.status === "returned") return ["pill-amber", t.pStReturned];
  if (item.status === "withdrawn") return ["pill-slate", t.pStWithdrawn];
  if (item.status === "registering") return ["pill-navy", t.pStRegistering];
  return ["pill-violet", t.pStSubmitted];
}

function VerifyPanel({ item, onOpen, onPin }: { item: Checkin; onOpen: (id: string) => void; onPin: () => void }) {
  const { t } = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState({
    patient_name: item.full_name,
    age: item.age === null ? "" : String(item.age),
    sex: ["female", "male", "other"].includes(item.sex) ? item.sex : "",
    systolic_bp: "",
    diastolic_bp: "",
    pulse: "",
    temperature_c: "",
    spo2: "",
    complaint: item.symptoms,
    known_conditions: item.known_conditions,
    medications: item.medications,
    nurse_notes: selfNotes(item),
  });
  const [identity, setIdentity] = useState(false);
  const [returning, setReturning] = useState(false);
  const [reason, setReason] = useState(t.ckReturnDefault);

  const refresh = () => {
    void client.invalidateQueries({ queryKey: ["checkins"] });
    void client.invalidateQueries({ queryKey: ["queue"] });
  };

  const register = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<Registered>(`/checkins/${item.id}/register`, body),
    onSuccess: refresh,
  });
  const sendBack = useMutation({
    mutationFn: () => apiPost<Checkin>(`/checkins/${item.id}/return`, { reason }),
    onSuccess: refresh,
  });

  const numberOrNull = (value: string) => (value.trim() === "" ? null : Number(value));

  function submit(event: FormEvent) {
    event.preventDefault();
    onPin();
    register.mutate({
      identity_confirmed: identity,
      intake: {
        patient_name: form.patient_name,
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
        nurse_notes: form.nurse_notes,
      },
    });
  }

  const done = register.data;
  if (done) {
    const triage = done.triage;
    return (
      <div className="grid gap-4">
        <section className="opd-hero" aria-live="polite">
          <p className="topbar-kicker">{t.opdIssued}</p>
          <p className="opd-hero__number">{triage.opd_number}</p>
          <p className="text-sm text-slate-700">{t.ckRegistered(triage.opd_number ?? "")}</p>
          {triage.case_id ? (
            <button type="button" className="btn-secondary mt-3" onClick={() => onOpen(triage.case_id ?? "")}>
              {t.ckOpenRecord}
            </button>
          ) : null}
        </section>
        <section className="panel min-w-0">
          <ResultCard result={triage} />
        </section>
        {triage.case_id ? (
          <NurseActions caseId={triage.case_id} suggestedLevel={triage.triage_level} department={triage.department} abstain={triage.abstain} />
        ) : null}
      </div>
    );
  }

  if (item.status !== "submitted") {
    const [tone, label] = statusPill(t, item);
    return (
      <div className="grid gap-4">
        <section className="panel">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="section-title">{item.full_name}</h3>
            <span className={`pill ${tone}`}>{label}</span>
          </div>
          {item.status_note ? <p className="mt-2 text-sm">{item.status_note}</p> : null}
          {item.reviewed_by ? <p className="mt-1 text-xs text-slate-500">{t.ckHandledBy(item.reviewed_by)}</p> : null}
          {item.case_id ? (
            <button type="button" className="btn-secondary mt-3" onClick={() => onOpen(item.case_id ?? "")}>
              {t.ckOpenRecord}
            </button>
          ) : null}
        </section>
        <SelfReportPanel item={item} />
      </div>
    );
  }

  const fieldError = (field: string) =>
    register.error instanceof ApiError
      ? register.error.fieldErrors.find((entry) => entry.field.endsWith(field))?.message
      : undefined;

  return (
    <div className="grid gap-4">
      <SelfReportPanel item={item} />
      <form className="panel" onSubmit={submit}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="section-title">{t.ckMeasured}</h3>
          <span className="pill pill-violet">{item.patient_ref}</span>
        </div>
        <p className="section-sub">{t.ckMeasuredHint}</p>

        <div className="field-grid mt-3">
          <label className="field-label">
            {t.patientName}
            <input className="field" maxLength={120} value={form.patient_name} onChange={(event) => setForm({ ...form, patient_name: event.target.value })} />
          </label>
          <label className="field-label">
            {t.age}
            <input className="field" inputMode="decimal" value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} />
          </label>
          <label className="field-label">
            {t.sex}
            <select className="field" value={form.sex} onChange={(event) => setForm({ ...form, sex: event.target.value })}>
              {sexOptions.map(([value, key]) => (
                <option key={value || "none"} value={value}>
                  {t[key]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset className="form-section">
          <legend className="form-section-title">{t.vitalSigns}</legend>
          <div className="field-grid is-vitals">
            {vitals.map(([name, label, unit, selfKey]) => {
              const home = item.self_vitals[selfKey];
              return (
                <label key={name} className="field-label" htmlFor={`ck-${name}`}>
                  {t[label]}
                  <span className="input-unit">
                    <input
                      id={`ck-${name}`}
                      className="field"
                      inputMode="decimal"
                      value={form[name as VitalKey]}
                      onChange={(event) => setForm({ ...form, [name]: event.target.value })}
                    />
                    <span aria-hidden="true">{unit}</span>
                  </span>
                  {home !== undefined ? <span className="home-hint">{t.ckHomeValue(`${home} ${unit}`)}</span> : null}
                </label>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="form-section">
          <legend className="form-section-title">{t.complaintHistory}</legend>
          <label className="field-label mt-3">
            {t.ckComplaint}
            <textarea className="field min-h-20" maxLength={2000} value={form.complaint} onChange={(event) => setForm({ ...form, complaint: event.target.value })} />
          </label>
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
          <label className="field-label mt-3">
            {t.nurseNotes}
            <textarea className="field min-h-20" maxLength={2000} value={form.nurse_notes} onChange={(event) => setForm({ ...form, nurse_notes: event.target.value })} />
          </label>
        </fieldset>

        <label className="mt-4 flex items-start gap-2 rounded-xl bg-sky-50 p-3 text-sm font-semibold text-sky-950">
          <input type="checkbox" className="mt-1" checked={identity} onChange={(event) => setIdentity(event.target.checked)} />
          <span>{t.ckIdentity}</span>
        </label>
        {fieldError("identity_confirmed") ? <p className="form-error">{fieldError("identity_confirmed")}</p> : null}

        {register.isError ? (
          <div role="alert" className="error-note mt-3">
            <p>{register.error.message}</p>
            {register.error instanceof ApiError && register.error.fieldErrors.length ? (
              <ul className="mt-1 list-disc pl-5 font-normal">
                {register.error.fieldErrors.map((entry) => (
                  <li key={`${entry.field}-${entry.message}`}>
                    {fieldLabel(t, entry.field.split(".").pop() ?? entry.field)}: {entry.message}
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        ) : null}

        <div className="mt-4 flex flex-wrap justify-between gap-2">
          <button type="button" className="btn-secondary" onClick={() => setReturning(!returning)} aria-expanded={returning}>
            {t.ckReturn}
          </button>
          <button type="submit" className="btn-primary px-6" disabled={!identity || register.isPending}>
            {register.isPending ? t.ckRegistering : t.ckRegister}
          </button>
        </div>
        {returning ? (
          <div className="mt-3 grid gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3">
            <label className="field-label">
              {t.ckReturnReason}
              <textarea className="field min-h-16" maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} />
            </label>
            {sendBack.isError ? <p className="error-note">{sendBack.error.message}</p> : null}
            <button type="button" className="btn-secondary justify-self-end" disabled={reason.trim().length < 3 || sendBack.isPending} onClick={() => {
                onPin();
                sendBack.mutate();
              }}>
              {t.ckReturn}
            </button>
          </div>
        ) : null}
      </form>
    </div>
  );
}

export function CheckinsPage({ onOpen }: { onOpen: (id: string) => void }) {
  const { t } = useLocale();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const list = useQuery({
    queryKey: ["checkins"],
    queryFn: () => apiGet<Checkin[]>("/checkins"),
    refetchInterval: 15_000,
  });
  const items = list.data ?? [];
  const waiting = items.filter((item) => item.status === "submitted");
  const recent = items.filter((item) => item.status !== "submitted").slice(0, 8);
  const selected = items.find((item) => item.id === selectedId) ?? waiting[0] ?? null;
  const flagged = waiting.filter((item) => item.red_flags.length).length;

  const entry = (item: Checkin) => {
    const [tone, label] = statusPill(t, item);
    return (
      <li key={item.id}>
        <button
          type="button"
          className={`desk-item ${item.red_flags.length && item.status === "submitted" ? "is-flagged" : ""}`}
          aria-current={selected?.id === item.id}
          onClick={() => setSelectedId(item.id)}
        >
          <span className="flex items-center justify-between gap-2">
            <strong className="truncate">{item.full_name}</strong>
            {item.status === "submitted" ? (
              <span className="text-xs font-semibold text-slate-500">{t.waitedFor(`${waitedMinutes(item.created_at)} min`)}</span>
            ) : (
              <span className={`pill ${tone}`}>{label}</span>
            )}
          </span>
          <span className="line-clamp-2 text-sm text-slate-600">{item.symptoms}</span>
          <span className="flex flex-wrap gap-1.5 text-xs">
            {item.red_flags.length ? <span className="pill pill-alert">{t.ckRedFlag}</span> : null}
            {item.age !== null ? <span className="chip">{item.age} y</span> : null}
            {item.previous_visits ? <span className="chip">{t.ckPrevious(item.previous_visits)}</span> : null}
          </span>
        </button>
      </li>
    );
  };

  return (
    <div className="grid gap-5">
      <PageHero
        tone="violet"
        icon="inbox"
        kicker={t.ckPortal}
        title={t.navCheckins}
        subtitle={t.descCheckins}
        aside={
          <div className="flex items-end gap-5">
            <div>
              <p className="text-3xl font-extrabold">{waiting.length}</p>
              <p className="text-xs opacity-80">{t.ckWaiting}</p>
            </div>
            <div>
              <p className="text-3xl font-extrabold">{flagged}</p>
              <p className="text-xs opacity-80">{t.ckRedFlag}</p>
            </div>
          </div>
        }
        actions={list.dataUpdatedAt ? <LiveBadge updatedAt={list.dataUpdatedAt} fetching={list.isFetching} /> : null}
      />
      {list.error ? <p className="error-note">{list.error.message}</p> : null}
      <div className="desk-grid">
        <aside className="grid gap-4">
          <section className="panel">
            <h3 className="section-title">{t.ckWaiting}</h3>
            {list.isLoading ? (
              <Skeleton lines={5} className="mt-3" />
            ) : waiting.length ? (
              <ul className="stagger mt-3 grid gap-2">{waiting.map(entry)}</ul>
            ) : (
              <EmptyState icon="check" title={t.ckNoneWaiting} />
            )}
          </section>
          {recent.length ? (
            <section className="panel">
              <h3 className="section-title">{t.ckRecent}</h3>
              <ul className="mt-3 grid gap-2">{recent.map(entry)}</ul>
            </section>
          ) : null}
        </aside>
        <div className="min-w-0">
          {selected ? (
            <VerifyPanel key={selected.id} item={selected} onOpen={onOpen} onPin={() => setSelectedId(selected.id)} />
          ) : (
            <EmptyState icon="clipboard" title={t.ckSelect} />
          )}
        </div>
      </div>
    </div>
  );
}
