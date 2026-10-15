import { useState } from "react";
import { LocaleProvider } from "./lib/i18n";
import { AppShell, type Page } from "./components/AppShell";
import { LiveTriagePage } from "./pages/LiveTriagePage";
import { QueuePage } from "./pages/QueuePage";
import { RecordsPage } from "./pages/RecordsPage";
import { RulesPage } from "./pages/RulesPage";
import { EvaluationPage } from "./pages/EvaluationPage";
import { AuditPage } from "./pages/AuditPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DoctorReviewPage } from "./pages/DoctorReviewPage";

export function App() {
  const [page, setPage] = useState<Page>("home");
  const [caseId, setCaseId] = useState<string | null>(null);

  function openRecord(id: string) {
    setCaseId(id);
    setPage("records");
  }

  return (
    <LocaleProvider>
      <AppShell page={page} onNavigate={setPage}>
        {page === "home" ? <DashboardPage onOpen={openRecord} onNavigate={setPage} /> : null}
        {page === "live" ? <LiveTriagePage /> : null}
        {page === "queue" ? <QueuePage onOpen={openRecord} /> : null}
        {page === "records" ? <RecordsPage caseId={caseId} onOpen={setCaseId} /> : null}
        {page === "doctor" ? <DoctorReviewPage onOpen={openRecord} /> : null}
        {page === "rules" ? <RulesPage /> : null}
        {page === "evaluation" ? <EvaluationPage /> : null}
        {page === "audit" ? <AuditPage onOpen={openRecord} /> : null}
        {page === "settings" ? <SettingsPage /> : null}
      </AppShell>
    </LocaleProvider>
  );
}
