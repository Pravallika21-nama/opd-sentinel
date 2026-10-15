import { useQuery } from "@tanstack/react-query";
import { fetchHealth } from "../api/health";
import { useLocale } from "../lib/i18n";

export function HealthPage() {
  const { t } = useLocale();
  const health = useQuery({
    queryKey: ["health"],
    queryFn: fetchHealth,
  });
  const statusRows = [
    ["Classical ML", t.buildClassical],
    ["Safety-Rule Layer", t.buildRules],
    [t.evaluationName, t.buildEvaluation],
  ] as const;

  return (
    <section className="flex flex-col gap-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm font-semibold uppercase tracking-wide text-teal">{t.healthKicker}</p>
        <h1 className="text-4xl font-semibold text-ink">OPD Sentinel</h1>
        <p className="max-w-2xl text-lg leading-relaxed text-ink">{t.healthIntro}</p>
      </header>

      <section aria-labelledby="api-health-heading" className="rounded-lg border border-line bg-card p-6">
        <h2 id="api-health-heading" className="text-xl font-semibold text-ink">
          {t.apiHealth}
        </h2>
        <p className="mt-2 text-ink">{t.apiHealthSub}</p>

        {health.isPending ? <p role="status" className="mt-4 text-lg">{t.checkingApi}</p> : null}

        {health.isError ? (
          <p role="alert" className="mt-4 text-lg font-semibold text-alert">
            {t.apiUnreachable}
          </p>
        ) : null}

        {health.data ? (
          <dl className="mt-4 grid grid-cols-[8rem_1fr] gap-y-2 text-lg">
            <dt className="font-semibold">{t.healthStatus}</dt>
            <dd>{health.data.status}</dd>
            <dt className="font-semibold">{t.healthService}</dt>
            <dd>{health.data.service}</dd>
            <dt className="font-semibold">{t.healthVersion}</dt>
            <dd>{health.data.version}</dd>
          </dl>
        ) : null}
      </section>

      <section aria-labelledby="build-status-heading" className="rounded-lg border border-line bg-card p-6">
        <h2 id="build-status-heading" className="text-xl font-semibold text-ink">
          {t.buildStatus}
        </h2>
        <dl className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[12rem_1fr]">
          {statusRows.map(([name, status]) => (
            <div key={name} className="contents">
              <dt className="font-semibold">{name}</dt>
              <dd>{status}</dd>
            </div>
          ))}
        </dl>
      </section>
    </section>
  );
}
