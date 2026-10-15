import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiGet, apiPost, apiPut, type Consultation, type Encounter, type QueueItem } from "../api/client";
import {
  ClinicalSummary,
  ConsultationSummary,
  EncounterHeader,
  MlRecommendation,
  NurseAssessment,
  PreviousEncounters,
  StatusHistory,
} from "../components/EncounterView";
import { refreshEncounterViews } from "../components/NurseActions";
import { QueuePlace } from "../components/QueueTable";
import { PrescriptionForm, PrescriptionList } from "../components/Prescriptions";
import { duration, levelName, useLocale } from "../lib/i18n";
import { consultationStatusName, consultationTone, formatDateTime, formatTime } from "../lib/workflow";

const noteFields = [
  ["examination_findings", "examFindings", 4000],
  ["clinical_assessment", "assessment", 4000],
  ["diagnosis", "diagnosis", 1000],
  ["treatment_plan", "plan", 4000],
  ["follow_up", "followUp", 1000],
  ["referral", "referral", 1000],
] as const;

type NoteForm = Record<(typeof noteFields)[number][0], string>;

function toForm(note: Consultation | null): NoteForm {
  return {
    examination_findings: note?.examination_findings ?? "",
    clinical_assessment: note?.clinical_assessment ?? "",
    diagnosis: note?.diagnosis ?? "",
    treatment_plan: note?.treatment_plan ?? "",
    follow_up: note?.follow_up ?? "",
    referral: note?.referral ?? "",
  };
}

function ConsultationForm({ encounter }: { encounter: Encounter }) {
  const { t, locale } = useLocale();
  const client = useQueryClient();
  const [form, setForm] = useState<NoteForm>(() => toForm(encounter.consultation));
  const [message, setMessage] = useState<string | null>(null);

  const savedId = encounter.consultation?.id;
  useEffect(() => {
    setForm(toForm(encounter.consultation));
    // Only reset when a new version is saved, so a background refetch keeps unsaved typing.
  }, [savedId]);

  const save = useMutation({
    mutationFn: () => apiPut(`/encounters/${encounter.case_id}/consultation`, form),
    onSuccess: async () => {
      setMessage(t.saved);
      await refreshEncounterViews(client, encounter.case_id);
    },
  });
  const status = useMutation({
    mutationFn: (next: "referred" | "completed") => apiPost(`/encounters/${encounter.case_id}/status`, { status: next }),
    onSuccess: async () => {
      setMessage(t.statusUpdated);
      await refreshEncounterViews(client, encounter.case_id);
    },
  });

  const saved = encounter.consultation;
  const dirty = JSON.stringify(form) !== JSON.stringify(toForm(saved));
  const empty = Object.values(form).every((value) => value.trim() === "");
  const canRefer = encounter.consultation_status !== "referred" && Boolean(saved?.referral.trim()) && !dirty;
  const canComplete = Boolean(saved && (saved.diagnosis.trim() || saved.clinical_assessment.trim())) && !dirty;

  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    save.mutate();
  }

  return (
    <form className="panel" onSubmit={submit} aria-label={t.examTitle}>
      <h3 className="section-title">{t.examTitle}</h3>
      <p className="section-sub">{t.examSub}</p>
      {saved ? (
        <p className="mt-1 text-xs text-slate-500">
          {t.consultationSaved(formatDateTime(locale, saved.created_at), saved.doctor_name)} {t.versions(encounter.consultation_versions)}
        </p>
      ) : null}
      <div className="mt-3 grid gap-3">
        {noteFields.map(([name, label, max]) => (
          <label key={name} className="field-label">
            {t[label]}
            <textarea
              className={`field ${name === "diagnosis" || name === "follow_up" || name === "referral" ? "min-h-14" : "min-h-20"}`}
              maxLength={max}
              value={form[name]}
              onChange={(event) => setForm({ ...form, [name]: event.target.value })}
            />
          </label>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button type="submit" className="btn-primary" disabled={empty || !dirty || save.isPending}>
          {save.isPending ? t.loading : t.saveConsultation}
        </button>
        <button
          type="button"
          className="btn-secondary"
          disabled={!canRefer || status.isPending}
          onClick={() => {
            if (window.confirm(t.confirmPrompt(t.refer))) status.mutate("referred");
          }}
        >
          {t.refer}
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={!canComplete || status.isPending}
          onClick={() => {
            if (window.confirm(t.confirmComplete)) status.mutate("completed");
          }}
        >
          {t.complete}
        </button>
      </div>
      {empty ? <p className="mt-2 text-xs text-slate-500">{t.nothingToSave}</p> : null}
      {save.isError ? (
        <p role="alert" className="error-note mt-2">
          {save.error.message}
        </p>
      ) : null}
      {status.isError ? (
        <p role="alert" className="error-note mt-2">
          {status.error.message}
        </p>
      ) : null}
      {message && !save.isError && !status.isError ? (
        <p role="status" className="success-note mt-2">
          {message}
        </p>
      ) : null}
    </form>
  );
}

function Consultation({ caseId, onSelect }: { caseId: string; onSelect: (id: string) => void }) {
  const { t } = useLocale();
  const client = useQueryClient();
  const encounter = useQuery({
    queryKey: ["encounter", caseId],
    queryFn: () => apiGet<Encounter>(`/encounters/${caseId}`),
  });
  const start = useMutation({
    mutationFn: () => apiPost(`/encounters/${caseId}/consultation/start`),
    onSuccess: () => refreshEncounterViews(client, caseId),
  });

  if (encounter.isPending) return <p role="status">{t.loading}</p>;
  if (encounter.isError) {
    return (
      <p role="alert" className="error-note">
        {encounter.error.message}
      </p>
    );
  }
  const data = encounter.data;
  const status = data.consultation_status;
  const active = status === "in_consultation" || status === "prescription_recorded";
  const editable = active || status === "referred";

  return (
    <div className="flex flex-col gap-4">
      <EncounterHeader encounter={data} />
      {status === "awaiting_doctor" ? (
        <div className="panel flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm">{t.consultationNotStarted}</p>
          <button type="button" className="btn-primary" disabled={start.isPending} onClick={() => start.mutate()}>
            {t.startConsultation}
          </button>
          {start.isError ? (
            <p role="alert" className="error-note w-full">
              {start.error.message}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="consult-grid">
        <div className="flex flex-col gap-4">
          <ClinicalSummary encounter={data} />
          <NurseAssessment encounter={data} />
          <MlRecommendation encounter={data} title={t.mlSupportTitle} />
          <PreviousEncounters encounter={data} onOpen={onSelect} />
        </div>
        <div className="flex flex-col gap-4">
          {editable ? <ConsultationForm key={data.case_id} encounter={data} /> : null}
          {status === "completed" ? <ConsultationSummary encounter={data} /> : null}
          {status === "registered" ? <p className="notice">{t.sendNeedsDecision}</p> : null}
          {active ? <PrescriptionForm encounter={data} /> : null}
          <PrescriptionList encounter={data} canCancel={editable} />
          <StatusHistory encounter={data} />
        </div>
      </div>
    </div>
  );
}

export function DoctorReviewPage({
  caseId,
  onSelect,
}: {
  caseId: string | null;
  onSelect: (id: string) => void;
}) {
  const { t, locale } = useLocale();
  const queue = useQuery({
    queryKey: ["doctor-queue"],
    queryFn: () => apiGet<QueueItem[]>("/doctor/queue"),
    refetchInterval: 30000,
  });
  const rows = queue.data ?? [];

  return (
    <div className="flex flex-col gap-5">
      <section className="panel">
        <h2 className="section-title">{t.doctorQueueTitle}</h2>
        <p className="section-sub mb-3">{t.doctorQueueSub}</p>
        {queue.isPending ? <p role="status">{t.loading}</p> : null}
        {queue.isError ? (
          <div className="error-note flex flex-wrap items-center gap-3" role="alert">
            <span>
              {t.dataUnavailable}. {queue.error.message}
            </span>
            <button type="button" className="btn-secondary" onClick={() => void queue.refetch()}>
              {t.retry}
            </button>
          </div>
        ) : null}
        {!queue.isPending && !queue.isError && rows.length === 0 ? <p className="text-sm">{t.doctorQueueEmpty}</p> : null}
        {rows.length > 0 ? (
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th scope="col">#</th>
                  <th scope="col">{t.colOpd}</th>
                  <th scope="col">{t.colArrival}</th>
                  <th scope="col">{t.colComplaint}</th>
                  <th scope="col">{t.colUrgency}</th>
                  <th scope="col">{t.colNurseNotes}</th>
                  <th scope="col">{t.department}</th>
                  <th scope="col">{t.colElapsed}</th>
                  <th scope="col">{t.colDoctorStatus}</th>
                  <th scope="col">{t.colAction}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => {
                  const status = item.consultation_status ?? "awaiting_doctor";
                  return (
                    <tr key={item.id} className={item.id === caseId ? "row-selected" : undefined}>
                      <td>
                        <QueuePlace item={item} />
                      </td>
                      <td className="font-bold">
                        {item.opd_number || t.opdPending}
                        {item.via_portal ? <span className="pill pill-violet ml-1.5 align-middle text-[0.65rem]">{t.ckPortal}</span> : null}
                      </td>
                      <td className="whitespace-nowrap">{formatTime(locale, item.arrival_time)}</td>
                      <td className="max-w-56">{item.complaint_preview || t.noComplaint}</td>
                      <td>
                        <span
                          className={`pill ${
                            item.triage_level === null || item.triage_level <= 2
                              ? "pill-alert"
                              : item.triage_level === 3
                                ? "pill-amber"
                                : "pill-navy"
                          }`}
                        >
                          {item.triage_level === null
                            ? t.unassessedNotLow
                            : `${item.triage_level} · ${levelName[locale][item.triage_level]}`}
                        </span>
                      </td>
                      <td className="max-w-56 text-sm">{item.nurse_notes || "—"}</td>
                      <td>{item.department ?? t.departmentPending}</td>
                      <td className="whitespace-nowrap">{duration(t, item.wait_seconds)}</td>
                      <td>
                        <span className={`pill ${consultationTone(status)}`}>{consultationStatusName(t, status)}</span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn-secondary"
                          onClick={() => onSelect(item.id)}
                          aria-label={`${t.open} ${item.opd_number || item.id}`}
                        >
                          {t.open}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
      {caseId ? <Consultation key={caseId} caseId={caseId} onSelect={onSelect} /> : <p className="panel">{t.selectToConsult}</p>}
    </div>
  );
}
