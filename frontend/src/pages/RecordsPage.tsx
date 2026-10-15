import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { apiGet, type AuditRow, type Encounter, type QueueItem } from "../api/client";
import {
  ClinicalSummary,
  ConsultationSummary,
  EncounterHeader,
  MlRecommendation,
  NurseAssessment,
  PreviousEncounters,
  StatusHistory,
} from "../components/EncounterView";
import { NurseActions } from "../components/NurseActions";
import { PrescriptionList } from "../components/Prescriptions";
import { useAuth } from "../lib/auth";
import { levelName, useLocale } from "../lib/i18n";
import { consultationStatusName, formatDateTime } from "../lib/workflow";

export function RecordsPage({
  caseId,
  onOpen,
}: {
  caseId: string | null;
  onOpen: (id: string) => void;
}) {
  const { t, locale } = useLocale();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const list = useQuery({
    queryKey: ["queue", "all"],
    queryFn: () => apiGet<QueueItem[]>("/queue?include_closed=true"),
    refetchInterval: 30_000,
  });
  const detail = useQuery({
    queryKey: ["encounter", caseId],
    queryFn: () => apiGet<Encounter>(`/encounters/${caseId}`),
    enabled: Boolean(caseId),
  });
  const audit = useQuery({
    queryKey: ["audit", caseId],
    queryFn: () => apiGet<AuditRow[]>(`/audit?case_id=${caseId}`),
    enabled: Boolean(caseId),
  });
  const selected = detail.data;
  const needle = search.trim().toLowerCase();
  const rows = (list.data ?? []).filter(
    (item) =>
      !needle ||
      [item.opd_number, item.patient_ref, item.id, item.complaint_preview]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle),
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[19rem_minmax(0,1fr)]">
      <section className="panel self-start">
        <h2 className="section-title">{t.encounters}</h2>
        <p className="mt-1 text-sm">{t.encountersSub}</p>
        <label className="field-label mt-3">
          <span className="sr-only">{t.searchQueue}</span>
          <input
            className="field"
            type="search"
            placeholder={t.searchQueue}
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {list.isPending ? <p role="status">{t.loading}</p> : null}
        {list.isError ? (
          <p role="alert" className="error-note mt-2">
            {t.dataUnavailable}. {list.error.message}
          </p>
        ) : null}
        <ul className="mt-3 flex max-h-[70vh] flex-col gap-1 overflow-y-auto">
          {rows.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                aria-current={item.id === caseId ? "true" : undefined}
                className={`w-full rounded-md px-2 py-2 text-left text-sm ${item.id === caseId ? "bg-[#1e3a8a] text-white" : "hover:bg-paper"}`}
                onClick={() => onOpen(item.id)}
              >
                <span className="font-semibold">{item.opd_number || item.id}</span>
                <span className="block">
                  {item.triage_level === null ? t.noLevel : `${t.levelN(item.triage_level)} ${levelName[locale][item.triage_level]}`} ·{" "}
                  {consultationStatusName(t, item.consultation_status ?? "registered")}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {!list.isPending && rows.length === 0 ? <p className="mt-2 text-sm">{t.noMatch}</p> : null}
      </section>
      <section className="min-w-0">
        {!caseId ? <p className="panel">{t.selectEncounter}</p> : null}
        {detail.isPending && caseId ? <p role="status">{t.loading}</p> : null}
        {detail.isError ? (
          <p role="alert" className="error-note">
            {detail.error.message}
          </p>
        ) : null}
        {selected ? (
          <div className="flex flex-col gap-4">
            <EncounterHeader encounter={selected} />
            <div className="consult-grid">
              <div className="flex flex-col gap-4">
                <ClinicalSummary encounter={selected} />
                <NurseAssessment encounter={selected} />
                <ConsultationSummary encounter={selected} />
                <PrescriptionList encounter={selected} />
              </div>
              <div className="flex flex-col gap-4">
                {user?.role === "nurse" ? (
                  <NurseActions
                    key={selected.case_id}
                    caseId={selected.case_id}
                    suggestedLevel={selected.decision?.triage_level ?? null}
                    department={selected.decision?.department ?? null}
                    abstain={Boolean(selected.decision?.abstain)}
                  />
                ) : null}
                <MlRecommendation encounter={selected} />
                <StatusHistory encounter={selected} />
                <PreviousEncounters encounter={selected} onOpen={onOpen} />
                <section className="panel">
                  <h3 className="section-title">{t.auditHistory}</h3>
                  {audit.isPending ? <p role="status">{t.loading}</p> : null}
                  {audit.isError ? <p role="alert">{audit.error.message}</p> : null}
                  {(audit.data ?? []).length === 0 && !audit.isPending ? <p className="text-sm">{t.noAuditRows}</p> : null}
                  <ul className="mt-2 flex flex-col gap-2 text-sm">
                    {(audit.data ?? []).map((row) => (
                      <li key={row.id}>
                        <span className="font-semibold">{formatDateTime(locale, row.created_at)}</span> · {row.event}
                        {row.actor ? ` · ${row.actor}` : ""}
                        {row.payload.reason ? `. ${row.payload.reason}` : ""}
                      </li>
                    ))}
                  </ul>
                </section>
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
