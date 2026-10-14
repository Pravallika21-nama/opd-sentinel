export type FieldIssue = {
  field: string;
  status: "ok" | "missing" | "implausible" | "conflicting";
  raw: unknown;
  detail: string;
};

export type ModelView = {
  level: number;
  p_emergency: number;
  department: string | null;
};

export type TriageResult = {
  case_id?: string;
  triage_level: number | null;
  department: string | null;
  department_source?: "classical" | "keyword_hint" | null;
  red_flags: { id: string; label: string; phrase: string }[];
  fired_rules: {
    id: string;
    description: string;
    min_level: number;
    reason: string;
    clinically_reviewed: boolean;
  }[];
  abstain: boolean;
  abstain_reasons: string[];
  uncertainty: number | null;
  classical: ModelView | null;
  quantum: ModelView | null;
  quantum_note: string | null;
  models_disagree: boolean;
  validation_issues: FieldIssue[];
  explanation: string[];
  illustrative?: boolean;
  source_label?: string | null;
  latency_ms?: number;
};

export type QueueItem = {
  id: string;
  arrival_time: string;
  wait_seconds: number;
  triage_level: number | null;
  department: string | null;
  abstain: boolean;
  illustrative: boolean;
  complaint_preview: string;
  review_status: "pending" | "confirmed" | "overridden" | "escalated";
  source_label: string | null;
  suggested_level?: number | null;
  data_quality?: "ok" | "warning";
  red_flag?: boolean;
  reassessment?: "none" | "requested";
  position_reason?: string;
  rank?: number;
};

const base = () => import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

export async function apiGet<T>(path: string): Promise<T> {
  const response = await fetch(`${base()}${path}`);
  if (!response.ok) {
    throw new Error(`Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${base()}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = (await response.json()) as T & { message?: string };
  if (!response.ok) {
    throw new Error(payload.message ?? `Request failed (${response.status})`);
  }
  return payload;
}
