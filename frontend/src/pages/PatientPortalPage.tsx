import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ApiError, apiGet, apiPost, fieldErrorFor, type Checkin } from "../api/client";
import { EmptyState, Icon, LiveBadge, PageHero, Skeleton, Stepper } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useLocale, type Copy, type Locale } from "../lib/i18n";
import { formatDateTime } from "../lib/workflow";

type Draft = {
  full_name: string;
  age: string;
  sex: string;
  preferred_language: Locale;
  symptoms: string;
  symptom_duration: string;
  severity: number | null;
  known_conditions: string;
  medications: string;
  allergies: string;
  self_temperature_c: string;
  self_pulse: string;
  self_systolic_bp: string;
  self_diastolic_bp: string;
  self_spo2: string;
  consent: boolean;
};

const homeFields = [
  ["self_temperature_c", "pTemp", "°C", "0.1"],
  ["self_pulse", "pPulse", "/min", "1"],
  ["self_systolic_bp", "pSystolic", "mmHg", "1"],
  ["self_diastolic_bp", "pDiastolic", "mmHg", "1"],
  ["self_spo2", "pSpo2", "%", "1"],
] as const;

const stepFields: string[][] = [
  ["full_name", "age", "sex", "preferred_language"],
  ["symptoms", "symptom_duration", "severity"],
  ["known_conditions", "medications", "allergies", ...homeFields.map(([key]) => key)],
  ["consent"],
];

function emptyDraft(name: string, locale: Locale): Draft {
  return {
    full_name: name,
    age: "",
    sex: "",
    preferred_language: locale,
    symptoms: "",
    symptom_duration: "",
    severity: null,
    known_conditions: "",
    medications: "",
    allergies: "",
    self_temperature_c: "",
    self_pulse: "",
    self_systolic_bp: "",
    self_diastolic_bp: "",
    self_spo2: "",
    consent: false,
  };
}

function optionalNumber(value: string): number | null {
  if (!value.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function severityColor(value: number): string {
  if (value >= 8) return "#b42318";
  if (value >= 6) return "#dc5a1e";
  if (value >= 4) return "#d4a017";
  if (value >= 1) return "#0f766e";
  return "#64748b";
}

function durations(t: Copy): string[] {
  return [t.pDurToday, t.pDur13, t.pDur47, t.pDurWeeks, t.pDurMonth];
}

function statusText(t: Copy, item: Checkin): string {
  if (item.status === "submitted") return t.pStSubmitted;
  if (item.status === "registering") return t.pStRegistering;
  if (item.status === "returned") return t.pStReturned;
  if (item.status === "withdrawn") return t.pStWithdrawn;
  return t.pStRegistered;
}

function statusTone(item: Checkin): string {
  if (item.status === "returned") return "pill-amber";
  if (item.status === "withdrawn") return "pill-slate";
  if (item.status === "registered") return "pill-ok";
  return "pill-violet";
}

function trackerFor(t: Copy, item: Checkin): { steps: string[]; current: number; failed: boolean } {
  const status = item.encounter?.consultation_status;
  const last = status === "referred" ? t.pTrackReferred : t.pTrackDone;
  const steps = [t.pTrackSent, t.pTrackVerified, t.pTrackDoctor, last];
  if (item.status === "returned" || item.status === "withdrawn") return { steps, current: 1, failed: true };
  if (item.status !== "registered") return { steps, current: 1, failed: false };
  if (status === "completed" || status === "referred") return { steps, current: steps.length, failed: false };
  return { steps, current: 2, failed: false };
}

function CheckinCard({ item, onWithdraw, withdrawing }: { item: Checkin; onWithdraw: () => void; withdrawing: boolean }) {
  const { t, locale } = useLocale();
  const tracker = trackerFor(t, item);
  const summary = item.encounter?.visit_summary ?? null;
  return (
    <article className={`checkin-card ${item.red_flags.length ? "is-flagged" : ""}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{t.pSentAt(formatDateTime(locale, item.created_at))}</p>
          <p className="mt-1 line-clamp-2 font-semibold">{item.symptoms}</p>
        </div>
        <span className={`pill ${statusTone(item)}`}>{statusText(t, item)}</span>
      </div>
      <div className="mt-3">
        <Stepper steps={tracker.steps} current={tracker.current} failed={tracker.failed} />
      </div>
      {item.encounter ? (
        <p className="mt-3 text-sm">
          {t.pOpd}: <strong className="font-mono">{item.encounter.opd_number}</strong>
        </p>
      ) : null}
      {item.encounter?.queue_place ? (
        <div className="patient-place mt-3" aria-live="polite">
          <span className="patient-place__number">{item.encounter.queue_place.position}</span>
          <div>
            <p className="font-bold">
              {t.pPlace(
                item.encounter.queue_place.position,
                item.encounter.queue_place.waiting,
                item.encounter.consultation_status === "awaiting_doctor" ? t.pPlaceDoctor : t.pPlaceNurse,
              )}
            </p>
            <p className="text-xs text-slate-600">{t.pPlaceNote}</p>
          </div>
        </div>
      ) : null}
      {item.status === "returned" && item.status_note ? (
        <p className="notice mt-3">
          {t.pReturned} {item.status_note}
        </p>
      ) : null}
      {item.red_flags.length && item.status === "submitted" ? (
        <p className="error-note mt-3">{t.pRedBody}</p>
      ) : null}
      {summary ? (
        <section className="mt-4 rounded-xl border border-teal-200 bg-teal-50/60 p-4" aria-label={t.pSummary}>
          <h4 className="flex items-center gap-2 font-bold text-teal-900">
            <Icon name="clipboard" className="h-4 w-4" />
            {t.pSummary}
          </h4>
          <dl className="mt-2 grid gap-2 text-sm">
            {[
              [t.pDoctor, summary.doctor_name],
              [t.pDiagnosis, summary.diagnosis],
              [t.pPlan, summary.treatment_plan],
              [t.pFollowUp, summary.follow_up],
              [t.pReferral, summary.referral],
            ]
              .filter(([, value]) => value)
              .map(([label, value]) => (
                <div key={label}>
                  <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</dt>
                  <dd className="whitespace-pre-line">{value}</dd>
                </div>
              ))}
          </dl>
          {summary.prescriptions.length ? (
            <div className="mt-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{t.pMedicines}</p>
              <ul className="mt-1 grid gap-1.5 text-sm">
                {summary.prescriptions.map((rx, index) => (
                  <li key={`${rx.medication}-${index}`} className="flex gap-2">
                    <Icon name="pill" className="mt-0.5 h-4 w-4 shrink-0 text-teal-700" />
                    <span>
                      <strong>{rx.medication}</strong> {rx.dose} {rx.dose_unit} · {rx.route} · {rx.frequency} · {rx.duration}
                      {rx.instructions ? <span className="block text-slate-600">{rx.instructions}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <p className="mt-3 text-xs text-slate-500">{t.pSummaryNote}</p>
        </section>
      ) : null}
      {item.status === "submitted" ? (
        <button type="button" className="btn-secondary mt-3" disabled={withdrawing} onClick={onWithdraw}>
          {t.pWithdraw}
        </button>
      ) : null}
    </article>
  );
}

export function PatientPortalPage() {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const client = useQueryClient();
  const [draft, setDraft] = useState<Draft>(() => emptyDraft(user?.display_name ?? "", locale));
  const [step, setStep] = useState(0);
  const [sent, setSent] = useState<Checkin | null>(null);

  const mine = useQuery({
    queryKey: ["patient-checkins"],
    queryFn: () => apiGet<Checkin[]>("/patient/checkins"),
    refetchInterval: 20_000,
  });

  const submit = useMutation({
    mutationFn: (body: Record<string, unknown>) => apiPost<Checkin>("/patient/checkins", body),
    onSuccess: (created) => {
      setSent(created);
      setDraft(emptyDraft(user?.display_name ?? "", locale));
      setStep(0);
      void client.invalidateQueries({ queryKey: ["patient-checkins"] });
    },
    onError: (error) => {
      if (!(error instanceof ApiError)) return;
      const first = error.fieldErrors[0]?.field.split(".").pop();
      const index = first ? stepFields.findIndex((fields) => fields.includes(first)) : -1;
      if (index >= 0) setStep(index);
    },
  });

  const withdraw = useMutation({
    mutationFn: (id: string) => apiPost<Checkin>(`/patient/checkins/${id}/withdraw`, {}),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["patient-checkins"] }),
  });

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((current) => ({ ...current, [key]: value }));
  const fieldError = (field: string) => fieldErrorFor(submit.error, field);

  const steps = [t.pStepAbout, t.pStepSymptoms, t.pStepHistory, t.pStepReview];
  const canNext = step === 0 ? draft.full_name.trim().length >= 2 : step === 1 ? draft.symptoms.trim().length >= 3 : true;

  function send(event: FormEvent) {
    event.preventDefault();
    if (step < steps.length - 1) {
      if (canNext) setStep(step + 1);
      return;
    }
    submit.mutate({
      full_name: draft.full_name,
      age: optionalNumber(draft.age),
      sex: draft.sex,
      preferred_language: draft.preferred_language,
      symptoms: draft.symptoms,
      symptom_duration: draft.symptom_duration,
      severity: draft.severity,
      known_conditions: draft.known_conditions,
      medications: draft.medications,
      allergies: draft.allergies,
      ...Object.fromEntries(homeFields.map(([key]) => [key, optionalNumber(draft[key])])),
      consent: draft.consent,
    });
  }

  const errorText = (field: string) =>
    fieldError(field) ? <span className="form-error">{fieldError(field)}</span> : null;

  const review: [string, string][] = [
    [t.pName, draft.full_name],
    [t.pAge, draft.age],
    [t.pSex, { female: t.pSexFemale, male: t.pSexMale, other: t.pSexOther, "not stated": t.pSexNone }[draft.sex] ?? ""],
    [t.pSymptoms, draft.symptoms],
    [t.pDuration, draft.symptom_duration],
    [t.pSeverityShort, draft.severity === null ? "" : t.pSeverityValue(draft.severity)],
    [t.pConditions, draft.known_conditions],
    [t.pMedications, draft.medications],
    [t.pAllergies, draft.allergies],
    ...homeFields
      .filter(([key]) => draft[key].trim())
      .map(([key, label, unit]) => [t[label], `${draft[key]} ${unit}`] as [string, string]),
  ];

  return (
    <div className="grid gap-5">
      <PageHero
        tone="teal"
        icon="heart"
        kicker={t.rolePatient}
        title={t.pHello(user?.display_name ?? "")}
        subtitle={t.pIntro}
        aside={
          mine.data?.[0] ? (
            <div className="text-sm">
              <p className="text-xs uppercase tracking-wide opacity-80">{t.pPatientId}</p>
              <p className="font-mono text-lg font-bold">{mine.data[0].patient_ref}</p>
            </div>
          ) : null
        }
      />

      <div className="emergency-banner" role="note">
        <span className="emergency-banner__icon">
          <Icon name="phone" />
        </span>
        <div>
          <p className="font-bold">{t.pEmergencyTitle}</p>
          <p className="text-sm">{t.pEmergencyBody}</p>
        </div>
      </div>

      {sent ? (
        <div className={sent.red_flags.length ? "error-note" : "notice"} role="status">
          {sent.red_flags.length ? (
            <>
              <p className="font-bold">{t.pRedTitle}</p>
              <p className="mt-1">{t.pRedBody}</p>
              <p className="mt-2 text-sm">
                {t.pMatched} {sent.red_flags.map((flag) => flag.label).join(", ")}
              </p>
            </>
          ) : (
            <p>{t.pSent}</p>
          )}
          <p className="mt-2 text-xs">{t.pQueueHint}</p>
        </div>
      ) : null}

      <div className="portal-grid">
        <form className="panel" onSubmit={send} aria-labelledby="new-checkin" noValidate>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="new-checkin" className="section-title">
              {t.pNew}
            </h3>
            <span className="text-xs font-semibold text-slate-500">{t.pStepOf(step + 1, steps.length)}</span>
          </div>
          <div className="wizard-steps mt-3" aria-hidden="true">
            {steps.map((label, index) => (
              <span key={label} className={index === step ? "is-active" : index < step ? "is-done" : ""}>
                {label}
              </span>
            ))}
          </div>

          <div key={step} className="mt-4 grid gap-3" style={{ animation: "fade-up 0.25s ease both" }}>
            {step === 0 ? (
              <>
                <label className="field-label">
                  {t.pName}
                  <input className="field" value={draft.full_name} onChange={(event) => set("full_name", event.target.value)} required autoComplete="name" />
                  {errorText("full_name")}
                </label>
                <div className="grid gap-3 sm:grid-cols-3">
                  <label className="field-label">
                    {t.pAge}
                    <input className="field" type="number" min={0} max={120} inputMode="numeric" value={draft.age} onChange={(event) => set("age", event.target.value)} />
                    {errorText("age")}
                  </label>
                  <label className="field-label">
                    {t.pSex}
                    <select className="field" value={draft.sex} onChange={(event) => set("sex", event.target.value)}>
                      <option value="">—</option>
                      <option value="female">{t.pSexFemale}</option>
                      <option value="male">{t.pSexMale}</option>
                      <option value="other">{t.pSexOther}</option>
                      <option value="not stated">{t.pSexNone}</option>
                    </select>
                  </label>
                  <label className="field-label">
                    {t.pLanguage}
                    <select className="field" value={draft.preferred_language} onChange={(event) => set("preferred_language", event.target.value as Locale)}>
                      <option value="en">English</option>
                      <option value="hi">हिन्दी</option>
                      <option value="te">తెలుగు</option>
                    </select>
                  </label>
                </div>
              </>
            ) : null}

            {step === 1 ? (
              <>
                <label className="field-label">
                  {t.pSymptoms}
                  <textarea className="field min-h-28" value={draft.symptoms} onChange={(event) => set("symptoms", event.target.value)} maxLength={2000} required />
                  <span className="text-xs font-normal text-slate-500">{t.pSymptomsHint}</span>
                  {errorText("symptoms")}
                </label>
                <label className="field-label">
                  {t.pDuration}
                  <select className="field" value={draft.symptom_duration} onChange={(event) => set("symptom_duration", event.target.value)}>
                    <option value="">—</option>
                    {durations(t).map((label) => (
                      <option key={label} value={label}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <fieldset>
                  <legend className="field-label">{t.pSeverity}</legend>
                  <div className="severity mt-1">
                    {Array.from({ length: 11 }, (_, value) => (
                      <button
                        key={value}
                        type="button"
                        aria-pressed={draft.severity === value}
                        style={draft.severity === value ? { background: severityColor(value) } : { color: severityColor(value) }}
                        onClick={() => set("severity", draft.severity === value ? null : value)}
                      >
                        {value}
                      </button>
                    ))}
                  </div>
                  <p className="mt-1 text-xs text-slate-500">{t.pSeverityScale}</p>
                </fieldset>
              </>
            ) : null}

            {step === 2 ? (
              <>
                {(
                  [
                    ["known_conditions", t.pConditions],
                    ["medications", t.pMedications],
                    ["allergies", t.pAllergies],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="field-label">
                    {label}
                    <input className="field" value={draft[key]} onChange={(event) => set(key, event.target.value)} maxLength={1000} />
                  </label>
                ))}
                <fieldset className="rounded-xl border border-dashed border-slate-300 p-3">
                  <legend className="px-1 text-sm font-semibold">{t.pHome}</legend>
                  <p className="text-xs text-slate-500">{t.pHomeHint}</p>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
                    {homeFields.map(([key, label, unit, stepSize]) => (
                      <label key={key} className="field-label">
                        <span>
                          {t[label]} <span className="font-normal text-slate-500">({unit})</span>
                        </span>
                        <input className="field" type="number" step={stepSize} inputMode="decimal" value={draft[key]} onChange={(event) => set(key, event.target.value)} />
                        {errorText(key)}
                      </label>
                    ))}
                  </div>
                </fieldset>
              </>
            ) : null}

            {step === 3 ? (
              <>
                <dl className="grid gap-2 rounded-xl bg-slate-50 p-3 text-sm sm:grid-cols-2">
                  {review
                    .filter(([, value]) => value.trim())
                    .map(([label, value]) => (
                      <div key={label} className={label === t.pSymptoms ? "sm:col-span-2" : ""}>
                        <dt className="text-xs font-semibold text-slate-500">{label}</dt>
                        <dd className="whitespace-pre-line">{value}</dd>
                      </div>
                    ))}
                </dl>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" className="mt-1" checked={draft.consent} onChange={(event) => set("consent", event.target.checked)} />
                  <span>{t.pConsent}</span>
                </label>
                {errorText("consent")}
              </>
            ) : null}
          </div>

          {submit.error && !(submit.error instanceof ApiError && submit.error.fieldErrors.length) ? (
            <p className="error-note mt-3" role="alert">
              {submit.error instanceof Error ? submit.error.message : String(submit.error)}
            </p>
          ) : null}

          <div className="mt-5 flex flex-wrap justify-between gap-2">
            <button type="button" className="btn-secondary" disabled={step === 0} onClick={() => setStep(step - 1)}>
              {t.pBack}
            </button>
            {step < steps.length - 1 ? (
              <button type="submit" className="btn-teal" disabled={!canNext}>
                {t.pNext}
              </button>
            ) : (
              <button type="submit" className="btn-teal" disabled={!draft.consent || submit.isPending}>
                <Icon name="send" className="h-4 w-4" />
                {submit.isPending ? t.pSubmitting : t.pSubmit}
              </button>
            )}
          </div>
        </form>

        <section className="grid gap-3" aria-labelledby="my-checkins">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="my-checkins" className="section-title">
              {t.pMine}
            </h3>
            {mine.dataUpdatedAt ? <LiveBadge updatedAt={mine.dataUpdatedAt} fetching={mine.isFetching} /> : null}
          </div>
          {mine.isLoading ? (
            <div className="panel">
              <Skeleton lines={4} />
            </div>
          ) : mine.error ? (
            <p className="error-note">{mine.error instanceof Error ? mine.error.message : String(mine.error)}</p>
          ) : mine.data && mine.data.length ? (
            <div className="stagger grid gap-3">
              {mine.data.map((item) => (
                <CheckinCard
                  key={item.id}
                  item={item}
                  withdrawing={withdraw.isPending}
                  onWithdraw={() => {
                    if (window.confirm(t.pWithdrawConfirm)) withdraw.mutate(item.id);
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState icon="clipboard" title={t.pNone} />
          )}
        </section>
      </div>
    </div>
  );
}
