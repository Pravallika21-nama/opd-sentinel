import type { Encounter } from "../api/client";
import { fieldStatusName, levelName, reviewActionName, reviewStatusName, useLocale } from "../lib/i18n";
import { consultationStatusName, consultationTone, formatDateTime } from "../lib/workflow";
import { ResultCard } from "./ResultCard";
import { SelfReportPanel } from "./SelfReport";

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value).trim();
}

const vitals = [
  ["systolic_bp", "systolic", "mmHg"],
  ["diastolic_bp", "diastolic", "mmHg"],
  ["pulse", "pulse", "bpm"],
  ["temperature_c", "temp", "°C"],
  ["spo2", "spo2", "%"],
] as const;

export function EncounterHeader({ encounter }: { encounter: Encounter }) {
  const { t, locale } = useLocale();
  const level = encounter.working_level;
  return (
    <header className="panel flex flex-wrap items-start justify-between gap-4">
      <div>
        <p className="topbar-kicker">{t.colOpd}</p>
        <h2 className="opd-number">{encounter.opd_number || t.opdPending}</h2>
        <p className="text-sm text-slate-600">
          {encounter.patient_name || "—"}
          {encounter.patient_ref ? ` · ${encounter.patient_ref}` : ""}
        </p>
        <p className="text-xs text-slate-500">
          {t.arrival(formatDateTime(locale, encounter.arrival_time))}
          {" · "}
          {t.registeredBy(encounter.registered_by ?? t.actorSystem, formatDateTime(locale, encounter.registered_at))}
        </p>
        <p className="text-xs text-slate-500">{t.internalId(encounter.case_id)}</p>
        {encounter.illustrative ? <p className="mt-1 text-sm font-semibold">{t.exampleNotRealOutcome}</p> : null}
      </div>
      <div className="flex flex-col items-end gap-2">
        <span className={`pill ${consultationTone(encounter.consultation_status)}`}>
          {consultationStatusName(t, encounter.consultation_status)}
        </span>
        {level ? (
          <span className={`triage-badge level-${level} text-base`}>
            {t.workingLevel(String(level))} · {levelName[locale][level]}
          </span>
        ) : (
          <span className="pill pill-alert">{t.unassessedNotLow}</span>
        )}
        <span className="text-xs text-slate-500">
          {t.colNurseStatus}: {reviewStatusName(t, encounter.review_status)}
        </span>
      </div>
    </header>
  );
}

export function ClinicalSummary({ encounter }: { encounter: Encounter }) {
  const { t } = useLocale();
  const input = encounter.input;
  const issues = encounter.decision?.validation_issues ?? [];
  return (
    <section className="panel">
      <h3 className="section-title">{t.vitalsRecorded}</h3>
      <dl className="kv mt-3">
        <dt>{t.age}</dt>
        <dd>{text(input.age) || t.blank}</dd>
        <dt>{t.sex}</dt>
        <dd>{text(input.sex) || t.sexNotRecorded}</dd>
        {vitals.map(([field, label, unit]) => {
          const issue = issues.find((item) => item.field === field && item.status !== "ok");
          const value = text(input[field]);
          return (
            <div key={field} className="contents">
              <dt>{t[label]}</dt>
              <dd>
                {value ? `${value} ${unit}` : t.blank}
                {issue ? (
                  <span className={`pill ml-2 ${issue.status === "missing" ? "pill-slate" : "pill-amber"}`} title={issue.detail}>
                    {fieldStatusName(t, issue.status)}
                  </span>
                ) : null}
              </dd>
            </div>
          );
        })}
      </dl>
      <h3 className="section-title mt-5">{t.complaintOwnWords}</h3>
      <p className="text-block mt-1">{text(input.complaint) || t.noComplaint}</p>
      <h3 className="section-title mt-4">{t.historyMeds}</h3>
      <dl className="kv mt-1">
        <dt>{t.conditions}</dt>
        <dd className="text-block">{text(input.known_conditions) || t.none}</dd>
        <dt>{t.medications}</dt>
        <dd className="text-block">{text(input.medications) || t.none}</dd>
        <dt>{t.nurseNotes}</dt>
        <dd className="text-block">{text(input.nurse_notes) || t.none}</dd>
        <dt>{t.uncertainInfo}</dt>
        <dd className="text-block">{text(input.uncertain_information) || t.none}</dd>
      </dl>
      {encounter.self_report ? (
        <div className="mt-4">
          <SelfReportPanel item={encounter.self_report} title={t.srTitle} note={t.srNote} />
        </div>
      ) : null}
    </section>
  );
}

export function NurseAssessment({ encounter }: { encounter: Encounter }) {
  const { t, locale } = useLocale();
  return (
    <section className="panel">
      <h3 className="section-title">{t.nurseAssessment}</h3>
      {encounter.reviews.length === 0 ? <p className="mt-1 text-sm">{t.noNurseDecision}</p> : null}
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {encounter.reviews.map((review) => (
          <li key={`${review.created_at}-${review.action}`} className="rounded-md border border-line px-3 py-2">
            {t.reviewLine(
              reviewActionName(t, review.action),
              review.triage_level === null ? t.unchanged : String(review.triage_level),
              formatDateTime(locale, review.created_at),
            )}{" "}
            {review.reason}
          </li>
        ))}
      </ul>
    </section>
  );
}

export function MlRecommendation({ encounter, title }: { encounter: Encounter; title?: string }) {
  const { t } = useLocale();
  if (!encounter.decision) {
    return (
      <section className="panel">
        <h3 className="section-title">{title ?? t.modelSuggestion}</h3>
        <p className="mt-1">{t.pending}</p>
      </section>
    );
  }
  return (
    <section className="panel">
      <h3 className="section-title">{title ?? t.modelSuggestion}</h3>
      <p className="section-sub mb-3">{t.modelSuggestionSub}</p>
      <ResultCard result={{ ...encounter.decision, assessed_at: encounter.assessed_at ?? undefined }} compact />
    </section>
  );
}

export function StatusHistory({ encounter }: { encounter: Encounter }) {
  const { t, locale } = useLocale();
  return (
    <section className="panel">
      <h3 className="section-title">{t.statusHistory}</h3>
      <ol className="mt-2 flex flex-col gap-2 text-sm">
        {encounter.status_history.map((row) => (
          <li key={`${row.created_at}-${row.status}`} className="flex flex-wrap items-center gap-2">
            <span className={`pill ${consultationTone(row.status)}`}>{consultationStatusName(t, row.status)}</span>
            <span>{formatDateTime(locale, row.created_at)}</span>
            <span className="text-slate-500">{row.actor ?? t.actorSystem}</span>
            {row.note ? <span className="text-slate-600">· {row.note}</span> : null}
          </li>
        ))}
      </ol>
    </section>
  );
}

export function ConsultationSummary({ encounter }: { encounter: Encounter }) {
  const { t, locale } = useLocale();
  const note = encounter.consultation;
  return (
    <section className="panel">
      <h3 className="section-title">{t.consultationSummary}</h3>
      {!note ? (
        <p className="mt-1 text-sm">{t.noConsultation}</p>
      ) : (
        <>
          <p className="text-xs text-slate-500">
            {t.consultationSaved(formatDateTime(locale, note.created_at), note.doctor_name)} {t.versions(encounter.consultation_versions)}
          </p>
          <dl className="kv mt-2">
            <dt>{t.examFindings}</dt>
            <dd className="text-block">{note.examination_findings || "—"}</dd>
            <dt>{t.assessment}</dt>
            <dd className="text-block">{note.clinical_assessment || "—"}</dd>
            <dt>{t.diagnosis}</dt>
            <dd className="text-block">{note.diagnosis || "—"}</dd>
            <dt>{t.plan}</dt>
            <dd className="text-block">{note.treatment_plan || "—"}</dd>
            <dt>{t.followUp}</dt>
            <dd className="text-block">{note.follow_up || "—"}</dd>
            <dt>{t.referral}</dt>
            <dd className="text-block">{note.referral || "—"}</dd>
          </dl>
        </>
      )}
    </section>
  );
}

export function PreviousEncounters({ encounter, onOpen }: { encounter: Encounter; onOpen?: (id: string) => void }) {
  const { t, locale } = useLocale();
  return (
    <section className="panel">
      <h3 className="section-title">{t.previousEncounters}</h3>
      {encounter.previous_encounters.length === 0 ? <p className="mt-1 text-sm">{t.noPrevious}</p> : null}
      <ul className="mt-2 flex flex-col gap-2 text-sm">
        {encounter.previous_encounters.map((item) => (
          <li key={item.case_id} className="rounded-md border border-line px-3 py-2">
            <div className="flex flex-wrap items-center gap-2">
              {onOpen ? (
                <button type="button" className="font-bold underline" onClick={() => onOpen(item.case_id)}>
                  {item.opd_number || item.case_id}
                </button>
              ) : (
                <span className="font-bold">{item.opd_number || item.case_id}</span>
              )}
              <span>{formatDateTime(locale, item.arrival_time)}</span>
              <span className={`pill ${consultationTone(item.consultation_status)}`}>
                {consultationStatusName(t, item.consultation_status)}
              </span>
            </div>
            <p className="mt-1">{item.complaint_preview || t.noComplaint}</p>
            {item.diagnosis ? (
              <p className="text-slate-600">
                {t.diagnosis}: {item.diagnosis}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
