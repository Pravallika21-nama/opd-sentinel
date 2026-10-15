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
  opd_number?: string;
  assessed_at?: string;
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
  model_status?: "ok" | "unavailable" | "error";
  validation_issues: FieldIssue[];
  explanation: string[];
  illustrative?: boolean;
  source_label?: string | null;
  latency_ms?: number;
};

export type ReviewStatus = "pending" | "confirmed" | "overridden" | "escalated";

export type ConsultationStatus =
  | "registered"
  | "awaiting_doctor"
  | "in_consultation"
  | "prescription_recorded"
  | "referred"
  | "completed";

export type QueueItem = {
  id: string;
  opd_number?: string;
  arrival_time: string;
  wait_seconds: number;
  triage_level: number | null;
  department: string | null;
  abstain: boolean;
  illustrative: boolean;
  complaint_preview: string;
  review_status: ReviewStatus;
  consultation_status?: ConsultationStatus;
  source_label: string | null;
  suggested_level?: number | null;
  data_quality?: "ok" | "warning";
  red_flag?: boolean;
  reassessment?: "none" | "requested";
  position_reason?: string;
  rank?: number;
  arrival_position?: number;
  systolic_bp?: number | null;
  diastolic_bp?: number | null;
  pulse?: number | null;
  temperature_c?: number | null;
  spo2?: number | null;
  nurse_notes?: string;
  patient_ref?: string;
  patient_name?: string;
  prescriptions?: number;
  via_portal?: boolean;
};

export type Consultation = {
  id: string;
  created_at: string;
  doctor_name: string;
  examination_findings: string;
  clinical_assessment: string;
  diagnosis: string;
  treatment_plan: string;
  follow_up: string;
  referral: string;
};

export type Prescription = {
  id: string;
  case_id: string;
  created_at: string;
  prescriber_name: string;
  medication: string;
  dose: string;
  dose_unit: string;
  route: string;
  frequency: string;
  duration: string;
  instructions: string;
  status: "active" | "cancelled";
  status_changed_at: string | null;
  status_reason: string | null;
};

export type Review = {
  action: string;
  triage_level: number | null;
  department: string | null;
  reason: string;
  created_at: string;
};

export type StatusEvent = {
  status: ConsultationStatus;
  created_at: string;
  actor: string | null;
  actor_role: string | null;
  note: string;
};

export type Encounter = {
  case_id: string;
  opd_number: string;
  arrival_time: string;
  registered_at: string;
  registered_by: string | null;
  patient_ref: string;
  patient_name: string;
  illustrative: boolean;
  input: Record<string, unknown>;
  decision: TriageResult | null;
  assessed_at: string | null;
  review_status: ReviewStatus;
  working_level: number | null;
  working_department: string | null;
  reassessment: "none" | "requested";
  consultation_status: ConsultationStatus;
  status_history: StatusEvent[];
  reviews: Review[];
  consultation: Consultation | null;
  consultation_versions: number;
  prescriptions: Prescription[];
  previous_encounters: {
    case_id: string;
    opd_number: string;
    arrival_time: string;
    complaint_preview: string;
    consultation_status: ConsultationStatus;
    diagnosis: string;
  }[];
  self_report?: SelfReport | null;
};

export type AuditRow = {
  id: number;
  case_id: string;
  created_at: string;
  event: string;
  actor: string | null;
  actor_role: string | null;
  payload: Record<string, unknown> & { reason?: string; action?: string; note?: string };
};

export type Role = "nurse" | "doctor" | "admin" | "patient";

export type CheckinStatus = "submitted" | "registering" | "registered" | "returned" | "withdrawn";

export type SelfReport = {
  id: string;
  created_at: string;
  status: CheckinStatus;
  status_note: string;
  patient_ref: string;
  full_name: string;
  age: number | null;
  sex: string;
  preferred_language: string;
  symptoms: string;
  symptom_duration: string;
  severity: number | null;
  known_conditions: string;
  medications: string;
  allergies: string;
  self_vitals: Partial<
    Record<"self_temperature_c" | "self_pulse" | "self_systolic_bp" | "self_diastolic_bp" | "self_spo2", number>
  >;
  red_flags: { id: string; label: string }[];
  reviewed_by?: string | null;
  reviewed_at: string | null;
  case_id: string | null;
};

export type VisitSummary = {
  doctor_name: string;
  diagnosis: string;
  treatment_plan: string;
  follow_up: string;
  referral: string;
  prescriptions: Pick<
    Prescription,
    "medication" | "dose" | "dose_unit" | "route" | "frequency" | "duration" | "instructions"
  >[];
};

export type EncounterProgress = {
  opd_number: string;
  consultation_status: ConsultationStatus;
  timeline: { status: ConsultationStatus; at: string }[];
  visit_summary: VisitSummary | null;
  queue_place?: { position: number; waiting: number } | null;
};

export type Checkin = SelfReport & { encounter: EncounterProgress | null; previous_visits?: number };

export type StaffUser = { username: string; display_name: string; role: Role };

export type FieldError = { field: string; message: string };

export class ApiError extends Error {
  status: number;
  fieldErrors: FieldError[];

  constructor(message: string, status: number, fieldErrors: FieldError[] = []) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.fieldErrors = fieldErrors;
  }
}

const base = () => import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";

let authToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setAuthToken(token: string | null) {
  authToken = token;
}

export function setUnauthorizedHandler(handler: (() => void) | null) {
  onUnauthorized = handler;
}

function headers(json: boolean): HeadersInit {
  const result: Record<string, string> = {};
  if (json) result["Content-Type"] = "application/json";
  if (authToken) result.Authorization = `Bearer ${authToken}`;
  return result;
}

function readError(payload: unknown, status: number): ApiError {
  const body = (payload ?? {}) as {
    message?: string;
    errors?: FieldError[];
    detail?: string | { message?: string; errors?: FieldError[] } | { msg?: string }[];
  };
  const detail = body.detail;
  let message = body.message;
  let errors = body.errors ?? [];
  if (!message && typeof detail === "string") message = detail;
  if (!message && detail && !Array.isArray(detail) && typeof detail === "object") {
    message = detail.message;
    errors = detail.errors ?? errors;
  }
  return new ApiError(message ?? `Request failed (${status})`, status, errors);
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base()}${path}`, {
      method,
      headers: headers(body !== undefined),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError("The OPD Sentinel API could not be reached.", 0);
  }
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  if (!response.ok) {
    if (response.status === 401 && onUnauthorized && !path.startsWith("/auth/")) onUnauthorized();
    throw readError(payload, response.status);
  }
  return payload as T;
}

export function apiGet<T>(path: string): Promise<T> {
  return request<T>("GET", path);
}

export function apiPost<T>(path: string, body: unknown = {}): Promise<T> {
  return request<T>("POST", path, body);
}

export function apiPut<T>(path: string, body: unknown): Promise<T> {
  return request<T>("PUT", path, body);
}

export function fieldErrorFor(error: unknown, field: string): string | null {
  if (!(error instanceof ApiError)) return null;
  const match = error.fieldErrors.find((item) => item.field === field || item.field.endsWith(`.${field}`));
  return match ? match.message : null;
}
