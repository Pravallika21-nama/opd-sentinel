import { useQuery } from "@tanstack/react-query";
import { apiGet } from "../api/client";
import { dateLocale, useLocale, type Copy } from "../lib/i18n";

type Section = Record<string, unknown> & { status?: string; reason?: string };
type Matrix = { labels: number[]; matrix: number[][] };
type PerLevel = { level: number; support: number; predicted: number; precision: number | null; recall: number | null };
type Group = { group: string; n: number; emergencies: number; emergency_recall: number | null; status: string; reason?: string };
type Report = {
  evaluation_kind?: string;
  data_source?: string;
  dataset?: string;
  label_mapping?: Record<string, unknown>;
  split_counts?: Record<string, number>;
  disclaimer?: string;
  generated_at?: string;
  cost_definition?: { undertriage_emergency_weight?: number; overtriage_weight?: number };
  sections?: Record<string, Section>;
};
type System = {
  classical_available?: boolean;
  model?: { version?: string | null; emergency_threshold?: number | null; trained_on?: string | null; train_rows?: number | null };
  data_source?: string;
  dataset?: string | null;
  dataset_licence?: string | null;
  dataset_doi?: string | null;
  dataset_rows?: number | null;
  split_counts?: Record<string, number> | null;
  mimic_iv_ed?: string;
  mimic_iv_ed_source?: string;
};

function num(section: Section | undefined, key: string): number | null {
  if (!section || section.status === "Pending") return null;
  const value = section[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function nestedNum(section: Section | undefined, group: string, key: string): number | null {
  const block = section?.[group];
  if (!block || typeof block !== "object" || Array.isArray(block)) return null;
  const value = (block as Section)[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function pct(value: number | null, pending: string): string {
  return value === null ? pending : `${Math.round(value * 1000) / 10}%`;
}

function plain(value: number | null, pending: string, suffix = ""): string {
  return value === null ? pending : `${value}${suffix}`;
}

function matrixOf(section: Section | undefined): Matrix | null {
  const value = section?.confusion_matrix as Matrix | undefined;
  return value && Array.isArray(value.labels) && Array.isArray(value.matrix) ? value : null;
}

function datasetKind(t: Copy, kind: string | undefined): string {
  if (kind === "public_deidentified_ktas") return t.datasetKindKtas;
  if (kind && kind.toLowerCase().includes("synthetic")) return t.datasetKindSynthetic;
  if (kind === "official") return t.datasetKindOfficial;
  return kind ?? t.evalPending;
}

function Verdict({
  t,
  title,
  tag,
  human,
  section,
  note,
}: {
  t: Copy;
  title: string;
  tag: string;
  human: boolean;
  section: Section | undefined;
  note: string;
}) {
  const caught = num(section, "caught_emergencies");
  const total = num(section, "n_emergencies");
  const missed = num(section, "missed_emergencies");
  const falseAlerts = num(section, "false_alerts");
  const scored = num(section, "n");
  const levelMatch = num(section, "triage_level_accuracy");
  const nonEmergencies = scored !== null && total !== null ? scored - total : null;
  const share = caught !== null && total ? Math.min(100, (caught / total) * 100) : 0;

  return (
    <article className={`panel verdict ${human ? "is-experiment" : ""}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-title">{title}</h3>
        <span className={`tag ${human ? "tag-slate" : "tag-sky"}`}>{tag}</span>
      </div>
      <p className="mt-3 text-sm font-semibold text-slate-600">{t.emergenciesCaught}</p>
      <p className="verdict-big">{caught !== null && total !== null ? t.countOf(caught, total) : t.evalPending}</p>
      <div className="meter" aria-hidden="true">
        <span style={{ width: `${share}%` }} />
      </div>
      <dl className="fact-grid">
        <div className="fact">
          <dt>{t.emergenciesMissed}</dt>
          <dd>{plain(missed, t.evalPending)}</dd>
        </div>
        <div className="fact">
          <dt>{t.falseAlarms}</dt>
          <dd>
            {falseAlerts !== null && nonEmergencies !== null
              ? t.countOf(falseAlerts, nonEmergencies)
              : plain(falseAlerts, t.evalPending)}
          </dd>
        </div>
        <div className="fact">
          <dt>{t.levelMatchLabel}</dt>
          <dd>{pct(levelMatch, t.evalPending)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-sm text-slate-600">{note}</p>
    </article>
  );
}

function ConfusionMatrix({ t, title, section }: { t: Copy; title: string; section: Section | undefined }) {
  const data = matrixOf(section);
  return (
    <article className="panel">
      <h3 className="section-title">
        {t.confusionTitle}: {title}
      </h3>
      <p className="section-sub">{t.confusionSub}</p>
      {!data ? (
        <p className="mt-2 text-slate-500">{t.evalPending}</p>
      ) : (
        <div className="table-scroll mt-3">
          <table className="data-table matrix" style={{ minWidth: 0 }}>
            <thead>
              <tr>
                <th scope="col">
                  {t.colLevel} ↓ / {t.colPredicted} →
                </th>
                {data.labels.map((label) => (
                  <th key={label} scope="col" className="text-center">
                    {label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.matrix.map((row, i) => {
                const rowTotal = row.reduce((sum, value) => sum + value, 0) || 1;
                return (
                  <tr key={data.labels[i]}>
                    <th scope="row">{data.labels[i]}</th>
                    {row.map((value, j) => (
                      <td
                        key={data.labels[j]}
                        className={`matrix-cell ${i === j ? "is-diagonal" : ""}`}
                        style={{ background: `rgb(29 78 216 / ${Math.round((value / rowTotal) * 45)}%)` }}
                      >
                        {value}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </article>
  );
}

type Admission = { n_admitted: number; sensitivity: number | null; specificity: number | null; flagged_urgent: number };
type ExternalArm = {
  caught_emergencies: number;
  missed_emergencies: number;
  false_alerts: number;
  emergency_recall: number | null;
  emergency_recall_ci95?: [number, number] | null;
  level_agreement_with_esi?: number | null;
  n_abstain?: number;
  admission?: Admission;
};

function ExternalTest({ t, section }: { t: Copy; section: Section | undefined }) {
  if (!section || section.status !== "measured") {
    return (
      <article className="panel">
        <h3 className="section-title">{t.extTitle}</h3>
        <p className="mt-2 text-slate-500">{t.extPending}</p>
      </article>
    );
  }
  const classical = section.classical as ExternalArm;
  const pipeline = section.pipeline as ExternalArm;
  const nurse = section.nurse_esi_admission as Admission | undefined;
  const total = num(section, "n_emergency_reference") ?? 0;
  const caveats = Array.isArray(section.caveats) ? (section.caveats as string[]) : [];
  const ci = (arm: ExternalArm) =>
    arm.emergency_recall_ci95 ? ` (95% CI ${pct(arm.emergency_recall_ci95[0], "")}–${pct(arm.emergency_recall_ci95[1], "")})` : "";
  const arms: [string, ExternalArm][] = [
    [t.colClassical, classical],
    [t.colFullSystem, pipeline],
  ];

  return (
    <article className="panel">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="section-title">{t.extTitle}</h3>
        <span className="tag tag-sky">{t.tagRealData}</span>
      </div>
      <p className="section-sub">
        {t.extSub} {t.extReference} {t.extStays(num(section, "n_labelled") ?? 0, num(section, "n_stays") ?? 0)}.
      </p>
      <div className="verdict-grid mt-4">
        {arms.map(([title, arm]) => (
          <div key={title} className="rounded-xl border border-line p-4">
            <p className="font-bold">{title}</p>
            <p className="verdict-big">{t.extCaught(arm.caught_emergencies, total)}</p>
            <div className="meter" aria-hidden="true">
              <span style={{ width: `${total ? (arm.caught_emergencies / total) * 100 : 0}%` }} />
            </div>
            <p className="mt-1 text-xs text-slate-500">
              {t.recallLabel}: {pct(arm.emergency_recall, t.evalPending)}
              {ci(arm)}
            </p>
            <dl className="fact-grid">
              <div className="fact">
                <dt>{t.extMissed}</dt>
                <dd>{arm.missed_emergencies}</dd>
              </div>
              <div className="fact">
                <dt>{t.extExtra}</dt>
                <dd>{arm.false_alerts}</dd>
              </div>
              {arm.level_agreement_with_esi != null ? (
                <div className="fact">
                  <dt>{t.extAgreement}</dt>
                  <dd>{pct(arm.level_agreement_with_esi, "—")}</dd>
                </div>
              ) : (
                <div className="fact">
                  <dt>{t.sentWithoutGuess}</dt>
                  <dd>{arm.n_abstain ?? "—"}</dd>
                </div>
              )}
            </dl>
          </div>
        ))}
      </div>
      <div className="table-scroll mt-4">
        <table className="data-table" style={{ minWidth: 0 }}>
          <thead>
            <tr>
              <th scope="col"> </th>
              <th scope="col">{t.extAdmission}</th>
              <th scope="col">{t.extSpecificity}</th>
            </tr>
          </thead>
          <tbody>
            {[
              [t.colClassical, classical.admission],
              [t.colFullSystem, pipeline.admission],
              [t.extNurse, nurse],
            ].map(([label, adm]) => (
              <tr key={label as string}>
                <td className="font-semibold">{label as string}</td>
                <td>{pct((adm as Admission | undefined)?.sensitivity ?? null, "—")}</td>
                <td>{pct((adm as Admission | undefined)?.specificity ?? null, "—")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {caveats.length ? (
        <div className="notice mt-4">
          <p className="font-semibold">{t.extCaveats}</p>
          <ul className="mt-1 list-disc pl-5 text-sm">
            {caveats.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </article>
  );
}

export function EvaluationPage() {
  const { t, locale } = useLocale();
  const report = useQuery({ queryKey: ["metrics"], queryFn: () => apiGet<Report>("/metrics") });
  const system = useQuery({ queryKey: ["system"], queryFn: () => apiGet<System>("/system") });
  if (report.isPending || system.isPending) return <p role="status">{t.loading}</p>;
  if (report.isError) return <p role="alert" className="error-note">{report.error.message}</p>;
  if (system.isError) return <p role="alert" className="error-note">{system.error.message}</p>;

  const pending = t.evalPending;
  const data = report.data;
  const sys = system.data;
  const classical = data.sections?.classical;
  const nurses = data.sections?.nurse_reference;
  const pipeline = data.sections?.pipeline;
  const runtime = data.sections?.runtime;
  const fairness = data.sections?.fairness;
  const external = data.sections?.external_mimic_demo;
  const kind = data.data_source ?? sys.data_source;
  const synthetic = (kind ?? "").toLowerCase().includes("synthetic");
  const ktas = kind === "public_deidentified_ktas";
  const proxy = (data.evaluation_kind ?? "").toLowerCase().includes("proxy");

  const scored = num(classical, "n");
  const emergencies = num(classical, "n_emergencies");
  const missWeight = data.cost_definition?.undertriage_emergency_weight ?? null;
  const alarmWeight = data.cost_definition?.overtriage_weight ?? null;
  const cAlarms = num(classical, "false_alerts");
  const pAlarms = num(pipeline, "false_alerts");
  const abstained = num(pipeline, "n_abstain");
  const pCaught = num(pipeline, "caught_emergencies");
  const pEmergencies = num(pipeline, "n_emergencies");
  const pScored = num(pipeline, "n");
  const hasNurses = nurses !== undefined && nurses.status !== "Pending";

  const meaning: string[] = [];
  if (hasNurses) meaning.push(t.mlVsNurse);
  if (pAlarms !== null && cAlarms !== null && pAlarms > cAlarms) meaning.push(t.meaningAlarms(pAlarms - cAlarms));

  const rows: { label: string; help: string; values: string[] }[] = [
    {
      label: t.recallLabel,
      help: t.recallHelp,
      values: [num(classical, "emergency_recall"), num(nurses, "emergency_recall"), num(pipeline, "emergency_recall")].map((v) => pct(v, pending)),
    },
    {
      label: t.emergenciesMissed,
      help: t.missedHelp,
      values: [num(classical, "missed_emergencies"), num(nurses, "missed_emergencies"), num(pipeline, "missed_emergencies")].map((v) => plain(v, pending)),
    },
    {
      label: t.falseAlarms,
      help: t.falseAlarmsHelp,
      values: [cAlarms, num(nurses, "false_alerts"), pAlarms].map((v) => plain(v, pending)),
    },
    {
      label: t.precisionLabel,
      help: t.precisionHelp,
      values: [num(classical, "emergency_precision"), num(nurses, "emergency_precision"), num(pipeline, "emergency_precision")].map((v) => pct(v, pending)),
    },
    {
      label: t.levelMatchLabel,
      help: t.levelMatchHelp,
      values: [num(classical, "triage_level_accuracy"), num(nurses, "triage_level_accuracy"), num(pipeline, "triage_level_accuracy")].map((v) => pct(v, pending)),
    },
    {
      label: t.deptMatchLabel,
      help: typeof classical?.department_note === "string" ? classical.department_note : t.deptMatchHelp,
      values: [pct(num(classical, "department_accuracy"), pending), "—", pct(num(pipeline, "department_accuracy"), pending)],
    },
    {
      label: t.costLabel,
      help: missWeight !== null && alarmWeight !== null ? t.costHelpWeights(missWeight, alarmWeight) : t.costHelp,
      values: [num(classical, "cost"), num(nurses, "cost"), num(pipeline, "cost")].map((v) => plain(v, pending)),
    },
    {
      label: t.medianLabel,
      help: t.medianHelp,
      values: [plain(nestedNum(runtime, "classical", "p50_ms"), pending, " ms"), "—", plain(nestedNum(runtime, "pipeline", "p50_ms"), pending, " ms")],
    },
  ];

  const perLevel = (Array.isArray(classical?.per_level) ? classical.per_level : []) as PerLevel[];
  const bySex = (Array.isArray(fairness?.by_sex) ? fairness.by_sex : []) as Group[];
  const byAge = (Array.isArray(fairness?.by_age) ? fairness.by_age : []) as Group[];
  const splits = data.split_counts ?? sys.split_counts ?? null;
  const mapping = data.label_mapping ?? null;

  return (
    <section className="flex flex-col gap-5">
      <article className="panel">
        <div className="flex flex-wrap gap-2">
          {ktas ? <span className="tag tag-sky">{t.tagRealData}</span> : null}
          {synthetic ? <span className="tag tag-amber">{t.tagSynthetic}</span> : null}
          {proxy ? <span className="tag tag-amber">{t.tagProxy}</span> : null}
          <span className="tag tag-slate">{t.tagNotClinical}</span>
        </div>
        <h2 className="mt-3 text-xl font-bold tracking-tight">
          {scored !== null && emergencies !== null ? t.evalHeadlineReal(scored, emergencies) : t.evalNotRun}
        </h2>
        <p className="mt-2 max-w-4xl text-slate-600">
          {missWeight !== null && alarmWeight !== null ? t.introRatio(missWeight / alarmWeight) : t.introFarWorse}
        </p>
        {data.disclaimer ? <p className="mt-2 max-w-4xl text-sm text-slate-500">{data.disclaimer}</p> : null}
      </article>

      <article className="panel">
        <h3 className="section-title">{t.datasetTitle}</h3>
        <dl className="kv mt-3">
          <dt>{t.testData}</dt>
          <dd>
            <span className="font-semibold">{data.dataset ?? sys.dataset ?? pending}</span>
            <span className="block text-slate-600">{datasetKind(t, kind)}</span>
          </dd>
          {sys.dataset_licence ? (
            <>
              <dt>{t.licence}</dt>
              <dd>{sys.dataset_licence}</dd>
            </>
          ) : null}
          {sys.dataset_doi ? (
            <>
              <dt>{t.sourceLink}</dt>
              <dd>
                <a className="font-semibold text-action underline" href={sys.dataset_doi} target="_blank" rel="noreferrer">
                  {sys.dataset_doi}
                </a>
              </dd>
            </>
          ) : null}
          <dt>{t.records}</dt>
          <dd>{sys.dataset_rows ?? pending}</dd>
          <dt>{t.splitsLabel}</dt>
          <dd>{splits ? [splits.train, splits.val ?? splits.validation, splits.test].map((n) => n ?? "—").join(" / ") : pending}</dd>
          {mapping ? (
            <>
              <dt>{t.labelMapping}</dt>
              <dd>
                <ul className="flex flex-col gap-1 text-sm">
                  {Object.entries(mapping).map(([key, value]) => (
                    <li key={key}>
                      <span className="font-semibold">{key}</span>: {typeof value === "string" ? value : JSON.stringify(value)}
                    </li>
                  ))}
                </ul>
              </dd>
            </>
          ) : null}
          <dt>{t.modelInfo}</dt>
          <dd>
            Classical ML {sys.model?.version ?? ""}
            {sys.model?.emergency_threshold != null ? ` · threshold ${sys.model.emergency_threshold}` : ""}
            {sys.model?.train_rows != null ? ` · ${t.trainedOn}: ${sys.model.train_rows}` : ""}
          </dd>
        </dl>
        {ktas ? <p className="notice mt-3">{t.notOpdNote}</p> : null}
        {external?.status === "measured" ? null : <p className="mt-3 text-sm text-slate-600">
          {t.mimicPending}{" "}
          <a
            className="font-semibold text-action underline"
            href={sys.mimic_iv_ed_source ?? "https://physionet.org/content/mimic-iv-ed/"}
            target="_blank"
            rel="noreferrer"
          >
            PhysioNet
          </a>
          {t.mimicAfter} {sys.mimic_iv_ed ?? ""}
        </p>}
      </article>

      <div className="verdict-grid">
        <Verdict
          t={t}
          title={t.colClassical}
          tag={t.tagLive}
          human={false}
          section={classical}
          note={sys.classical_available ? t.classicalVerdictNote : t.classicalVerdictMissing}
        />
        <Verdict t={t} title={t.nurseRefTitle} tag={t.colNurses} human section={nurses} note={t.nurseRefNote} />
      </div>

      {meaning.length > 0 ? (
        <article className="callout">
          <h3 className="section-title">{t.whatThisMeans}</h3>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-slate-700">
            {meaning.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </article>
      ) : null}

      <article className="panel">
        <h3 className="section-title">{t.pipelineTitle}</h3>
        <p className="section-sub">{t.fullSystemSub}</p>
        <dl className="fact-grid">
          <div className="fact">
            <dt>{t.emergenciesCaught}</dt>
            <dd>{pCaught !== null && pEmergencies !== null ? t.countOf(pCaught, pEmergencies) : pending}</dd>
          </div>
          <div className="fact">
            <dt>{t.emergenciesMissed}</dt>
            <dd>{plain(num(pipeline, "missed_emergencies"), pending)}</dd>
          </div>
          <div className="fact">
            <dt>{t.falseAlarms}</dt>
            <dd>{plain(pAlarms, pending)}</dd>
          </div>
          <div className="fact">
            <dt>{t.sentWithoutGuess}</dt>
            <dd>{abstained !== null && pScored !== null ? t.countOf(abstained, pScored) : pending}</dd>
          </div>
        </dl>
      </article>

      <ExternalTest t={t} section={external} />

      <article className="panel">
        <h3 className="section-title">{t.sideBySide}</h3>
        <p className="section-sub">{t.sideBySideSub}</p>
        <div className="table-scroll mt-4">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">{t.colMeasure}</th>
                <th scope="col">{t.colMeaning}</th>
                <th scope="col">{t.colClassical}</th>
                <th scope="col">{t.colNurses}</th>
                <th scope="col">{t.colFullSystem}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.label}>
                  <td className="font-semibold">{row.label}</td>
                  <td className="text-slate-600">{row.help}</td>
                  {row.values.map((value, index) => (
                    <td key={index} className={value === pending || value === "—" ? "text-slate-500" : "font-semibold"}>
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      <div className="grid gap-5 xl:grid-cols-2">
        <ConfusionMatrix t={t} title={t.colClassical} section={classical} />
        <ConfusionMatrix t={t} title={t.colNurses} section={nurses} />
      </div>

      <article className="panel">
        <h3 className="section-title">
          {t.perLevelTitle}: {t.colClassical}
        </h3>
        {perLevel.length === 0 ? (
          <p className="mt-2 text-slate-500">{pending}</p>
        ) : (
          <div className="table-scroll mt-3">
            <table className="data-table" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th scope="col">{t.colLevel}</th>
                  <th scope="col">{t.colSupport}</th>
                  <th scope="col">{t.colPredicted}</th>
                  <th scope="col">{t.colPrecision}</th>
                  <th scope="col">{t.colRecall}</th>
                </tr>
              </thead>
              <tbody>
                {perLevel.map((row) => (
                  <tr key={row.level}>
                    <td className="font-semibold">{row.level}</td>
                    <td>{row.support}</td>
                    <td>{row.predicted}</td>
                    <td>{pct(row.precision, "—")}</td>
                    <td>{pct(row.recall, "—")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </article>

      {bySex.length + byAge.length > 0 ? (
        <article className="panel">
          <h3 className="section-title">{t.recallLabel}</h3>
          {typeof fairness?.note === "string" ? <p className="section-sub">{fairness.note}</p> : null}
          <div className="table-scroll mt-3">
            <table className="data-table" style={{ minWidth: 0 }}>
              <thead>
                <tr>
                  <th scope="col"> </th>
                  <th scope="col">{t.records}</th>
                  <th scope="col">{t.colSupport}</th>
                  <th scope="col">{t.recallLabel}</th>
                </tr>
              </thead>
              <tbody>
                {[...bySex, ...byAge].map((row) => (
                  <tr key={row.group}>
                    <td className="font-semibold">{row.group}</td>
                    <td>{row.n}</td>
                    <td>{row.emergencies}</td>
                    <td>{row.status === "Pending" ? `${pending} ${row.reason ?? ""}` : pct(row.emergency_recall, pending)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-2">
        <article className="panel">
          <h3 className="section-title">{t.sourcesTitle}</h3>
          <dl className="mt-3 flex flex-col gap-3 text-sm">
            <div>
              <dt className="font-semibold">{t.howScored}</dt>
              <dd className="text-slate-600">{proxy ? t.proxyScored : data.evaluation_kind ?? pending}</dd>
            </div>
            {data.generated_at ? (
              <div>
                <dt className="font-semibold">{t.reportGenerated}</dt>
                <dd className="text-slate-600">{new Date(data.generated_at).toLocaleString(dateLocale[locale])}</dd>
              </div>
            ) : null}
          </dl>
        </article>

        <article className="panel">
          <h3 className="section-title">{t.glossaryTitle}</h3>
          <dl className="glossary">
            <div>
              <dt>{t.heldOut}</dt>
              <dd>{t.heldOutBody}</dd>
            </div>
            <div>
              <dt>{t.falseAlarm}</dt>
              <dd>{t.falseAlarmBody}</dd>
            </div>
            <div>
              <dt>{t.sentWithoutGuess}</dt>
              <dd>{t.withoutGuessBody(t.cannotAssess)}</dd>
            </div>
          </dl>
        </article>
      </div>
    </section>
  );
}
