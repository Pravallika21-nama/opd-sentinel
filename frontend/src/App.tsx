import { useState } from "react";
import type { Role } from "./api/client";
import { AuthProvider, useAuth } from "./lib/auth";
import { LocaleProvider } from "./lib/i18n";
import { AppShell, pagesFor, type Page } from "./components/AppShell";
import { LiveTriagePage } from "./pages/LiveTriagePage";
import { QueuePage } from "./pages/QueuePage";
import { RecordsPage } from "./pages/RecordsPage";
import { RulesPage } from "./pages/RulesPage";
import { EvaluationPage } from "./pages/EvaluationPage";
import { AuditPage } from "./pages/AuditPage";
import { SettingsPage } from "./pages/SettingsPage";
import { DashboardPage } from "./pages/DashboardPage";
import { DoctorReviewPage } from "./pages/DoctorReviewPage";
import { OperationsPage } from "./pages/OperationsPage";
import { LoginPage } from "./pages/LoginPage";
import { PatientPortalPage } from "./pages/PatientPortalPage";
import { CheckinsPage } from "./pages/CheckinsPage";
import { InsightsPage } from "./pages/InsightsPage";

const landing: Record<Role, Page> = { nurse: "home", doctor: "doctor", admin: "operations", patient: "portal" };

function Workspace({ role }: { role: Role }) {
  const [page, setPage] = useState<Page>(landing[role]);
  const [caseId, setCaseId] = useState<string | null>(null);
  const allowed = pagesFor(role);
  const current = allowed.includes(page) ? page : landing[role];

  function openRecord(id: string) {
    setCaseId(id);
    if (role === "doctor") {
      setPage("doctor");
    } else {
      setPage("records");
    }
  }

  return (
    <AppShell page={current} onNavigate={setPage}>
      {current === "portal" ? <PatientPortalPage /> : null}
      {current === "home" ? <DashboardPage onOpen={openRecord} onNavigate={setPage} /> : null}
      {current === "checkins" ? <CheckinsPage onOpen={openRecord} /> : null}
      {current === "insights" ? <InsightsPage /> : null}
      {current === "live" ? <LiveTriagePage /> : null}
      {current === "queue" ? <QueuePage onOpen={openRecord} /> : null}
      {current === "records" ? <RecordsPage caseId={caseId} onOpen={setCaseId} /> : null}
      {current === "doctor" ? <DoctorReviewPage caseId={caseId} onSelect={setCaseId} /> : null}
      {current === "operations" ? <OperationsPage onOpen={openRecord} onNavigate={setPage} /> : null}
      {current === "rules" ? <RulesPage /> : null}
      {current === "evaluation" ? <EvaluationPage /> : null}
      {current === "audit" ? <AuditPage onOpen={openRecord} /> : null}
      {current === "settings" ? <SettingsPage /> : null}
    </AppShell>
  );
}

function Gate() {
  const { user } = useAuth();
  if (!user) return <LoginPage />;
  return <Workspace key={user.username} role={user.role} />;
}

export function App() {
  return (
    <LocaleProvider>
      <AuthProvider>
        <Gate />
      </AuthProvider>
    </LocaleProvider>
  );
}
