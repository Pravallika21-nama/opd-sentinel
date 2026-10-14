import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../api/health";

const pendingWork = [
  ["Classical ML", "Pending"],
  ["Quantum ML", "Pending. Experimental, simulator only."],
  ["Safety-Rule Layer", "Pending"],
  ["Evaluation", "Pending"],
] as const;

export function HealthPage() {
  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });

  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-3xl flex-col gap-8 px-6 py-10">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal">
          Outpatient decision support
        </p>
        <h1 className="text-4xl font-semibold text-ink">OPD Sentinel</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-ink">
          A nurse confirms every case. This tool does not diagnose and does not replace a doctor.
        </p>
      </header>

      <section aria-labelledby="api-health-heading" className="rounded-lg border border-line bg-card p-6">
        <h2 id="api-health-heading" className="text-xl font-semibold text-ink">
          API health
        </h2>
        <p className="mt-2 text-ink">Live check of the API process. This is not a model score.</p>

        {health.isPending ? <p role="status" className="mt-4 text-lg">Checking the API…</p> : null}

        {health.isError ? (
          <p role="alert" className="mt-4 text-lg font-semibold text-alert">
            Status: unreachable. The OPD Sentinel API did not respond.
          </p>
        ) : null}

        {health.data ? (
          <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-lg">
            <dt className="font-semibold">Status</dt>
            <dd>{health.data.status}</dd>
            <dt className="font-semibold">Service</dt>
            <dd>{health.data.service}</dd>
            <dt className="font-semibold">Version</dt>
            <dd>{health.data.version}</dd>
          </dl>
        ) : null}
      </section>

      <section aria-labelledby="build-status-heading" className="rounded-lg border border-line bg-card p-6">
        <h2 id="build-status-heading" className="text-xl font-semibold text-ink">
          Build status
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
          {pendingWork.map(([name, status]) => (
            <div key={name} className="contents">
              <dt className="font-semibold">{name}</dt>
              <dd>{status}</dd>
            </div>
          ))}
        </dl>
      </section>
    </main>
  );
}
