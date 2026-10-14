export type HealthResponse = {
  status: "ok";
  service: string;
  version: string;
};

export async function fetchHealth(): Promise<HealthResponse> {
  const base = import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:8000";
  const response = await fetch(`${base}/health`);
  if (!response.ok) {
    throw new Error(`Health check failed with status ${response.status}`);
  }
  return (await response.json()) as HealthResponse;
}
