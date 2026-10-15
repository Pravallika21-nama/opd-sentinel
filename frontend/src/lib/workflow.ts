import type { ConsultationStatus, QueueItem } from "../api/client";
import { dateLocale, type Copy, type Locale } from "./i18n";

export const consultationStatuses: ConsultationStatus[] = [
  "registered",
  "awaiting_doctor",
  "in_consultation",
  "prescription_recorded",
  "referred",
  "completed",
];

export function consultationStatusName(t: Copy, status: string): string {
  const names: Record<string, string> = {
    registered: t.csRegistered,
    awaiting_doctor: t.csAwaitingDoctor,
    in_consultation: t.csInConsultation,
    prescription_recorded: t.csPrescription,
    referred: t.csReferred,
    completed: t.csCompleted,
  };
  return names[status] ?? status;
}

export function consultationTone(status: string): string {
  if (status === "completed") return "pill-ok";
  if (status === "referred") return "pill-slate";
  if (status === "awaiting_doctor") return "pill-amber";
  return "pill-navy";
}

// Same definitions as backend/app/services/summary.py, so the filters match the KPI cards.
export function isUrgent(item: Pick<QueueItem, "triage_level" | "abstain">): boolean {
  return item.abstain || (item.triage_level !== null && item.triage_level <= 2);
}

export function awaitingNurse(item: QueueItem): boolean {
  return (
    (item.consultation_status ?? "registered") === "registered" &&
    (item.review_status === "pending" || item.reassessment === "requested")
  );
}

export function formatDateTime(locale: Locale, value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(dateLocale[locale], { dateStyle: "medium", timeStyle: "short" });
}

export function formatTime(locale: Locale, value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleTimeString(dateLocale[locale], { hour: "2-digit", minute: "2-digit" });
}

function num(value: number | null | undefined, digits = 0): string {
  return value === null || value === undefined ? "—" : value.toFixed(digits);
}

export function vitalsSummary(item: Pick<QueueItem, "systolic_bp" | "diastolic_bp" | "pulse" | "temperature_c" | "spo2">): string {
  return [
    `BP ${num(item.systolic_bp)}/${num(item.diastolic_bp)}`,
    `HR ${num(item.pulse)}`,
    `T ${num(item.temperature_c, 1)}`,
    `SpO2 ${num(item.spo2)}`,
  ].join(" · ");
}
