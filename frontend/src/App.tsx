import { useState } from "react";
import { LocaleProvider } from "./lib/i18n";
import { AppShell, type Page } from "./components/AppShell";
import { HealthPage } from "./pages/HealthPage";
import { IntakePage } from "./pages/IntakePage";
import { QueuePage } from "./pages/QueuePage";
import { CasePage } from "./pages/CasePage";
import { RulesPage } from "./pages/RulesPage";
import { EvaluationPage } from "./pages/EvaluationPage";

export function App() {
  const [page, setPage] = useState<Page>("intake");
  const [caseId, setCaseId] = useState<string | null>(null);

  function openCase(id: string) {
    setCaseId(id);
    setPage("case");
  }

  return (
    <LocaleProvider>
      <AppShell page={page} onNavigate={setPage}>
        {page === "intake" ? <IntakePage onOpenCase={openCase} /> : null}
        {page === "queue" ? <QueuePage onOpen={openCase} /> : null}
        {page === "case" && caseId ? <CasePage caseId={caseId} /> : null}
        {page === "case" && !caseId ? <p>Select a case from the queue.</p> : null}
        {page === "rules" ? <RulesPage /> : null}
        {page === "evaluation" ? <EvaluationPage /> : null}
        {page === "status" ? <HealthPage /> : null}
      </AppShell>
    </LocaleProvider>
  );
}
