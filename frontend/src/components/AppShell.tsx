import { useEffect, useState, type ReactNode } from "react";
import type { Role } from "../api/client";
import { useAuth } from "../lib/auth";
import { dateLocale, useLocale, type Copy, type Locale, type TextKey } from "../lib/i18n";

export type Page =
  | "home"
  | "checkins"
  | "live"
  | "queue"
  | "records"
  | "doctor"
  | "operations"
  | "insights"
  | "evaluation"
  | "rules"
  | "audit"
  | "settings"
  | "portal";

const locales: { id: Locale; label: string }[] = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी (Hindi)" },
  { id: "te", label: "తెలుగు (Telugu)" },
];

const descriptions: Record<Page, TextKey> = {
  home: "descHome",
  checkins: "descCheckins",
  insights: "descInsights",
  portal: "descPortal",
  live: "descRegister",
  queue: "descQueue",
  records: "descRecords",
  doctor: "descDoctor",
  operations: "descOperations",
  evaluation: "descEvaluation",
  rules: "descRules",
  audit: "descAudit",
  settings: "descSettings",
};

const sections: Record<Page, TextKey> = {
  home: "sectionNurse",
  checkins: "sectionNurse",
  insights: "sectionData",
  portal: "sectionPatient",
  live: "sectionNurse",
  queue: "sectionNurse",
  records: "sectionNurse",
  doctor: "sectionDoctor",
  operations: "sectionOperations",
  evaluation: "sectionResearch",
  rules: "sectionSafety",
  audit: "navSystem",
  settings: "navSystem",
};

const labels: Record<Page, TextKey> = {
  home: "home",
  checkins: "navCheckins",
  insights: "navInsights",
  portal: "navPortal",
  live: "navRegister",
  queue: "queue",
  records: "records",
  doctor: "doctor",
  operations: "navOperations",
  evaluation: "evaluation",
  rules: "rules",
  audit: "auditNav",
  settings: "settings",
};

// Navigation mirrors the backend role checks; hiding a link is not the access control.
export const roleWorkspaces: Record<Role, Page[]> = {
  nurse: ["home", "checkins", "live", "queue", "records"],
  doctor: ["doctor", "queue", "records"],
  admin: ["operations", "queue", "records", "audit"],
  patient: ["portal"],
};

const systemPages: Page[] = ["insights", "evaluation", "rules", "settings"];

export function pagesFor(role: Role): Page[] {
  if (role === "patient") return roleWorkspaces.patient;
  return [...roleWorkspaces[role], ...systemPages];
}

export function roleName(t: Copy, role: Role): string {
  if (role === "nurse") return t.roleNurse;
  if (role === "doctor") return t.roleDoctor;
  if (role === "patient") return t.rolePatient;
  return t.roleAdmin;
}

const icons: Record<Page, string> = {
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z",
  checkins: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1",
  insights: "M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  portal: "M12 20.5s-6.2-4-8.6-7.8C1.6 9.8 2.4 6.8 5 5.6c2-.9 4.1-.2 5.4 1.6L12 9l1.6-1.8c1.3-1.8 3.4-2.5 5.4-1.6 2.6 1.2 3.4 4.2 1.6 7.1-2.4 3.8-8.6 7.8-8.6 7.8z",
  live: "M12 5v14M5 12h14",
  queue: "M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01",
  records: "M7 3h8l4 4v14H7zM15 3v4h4",
  doctor: "M8 21v-2a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v2M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  operations: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  rules: "M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6z",
  evaluation: "M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-2",
  audit: "M8 4h8v16H8zM10 8h4M10 12h4",
  settings:
    "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M12 3v2M12 19v2M4.9 6.5l1.7 1M17.4 16.5l1.7 1M3 12h2M19 12h2M4.9 17.5l1.7-1M17.4 7.5l1.7-1",
};

function Heart() {
  return (
    <svg viewBox="0 0 24 24" className="heart" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 20.5s-6.2-4-8.6-7.8C1.6 9.8 2.4 6.8 5 5.6c2-.9 4.1-.2 5.4 1.6L12 9l1.6-1.8c1.3-1.8 3.4-2.5 5.4-1.6 2.6 1.2 3.4 4.2 1.6 7.1-2.4 3.8-8.6 7.8-8.6 7.8z"
      />
    </svg>
  );
}

function msToNextMinute() {
  return 60000 - (Date.now() % 60000);
}

function Clock() {
  const { t, locale } = useLocale();
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    let timer = window.setTimeout(function tick() {
      setNow(new Date());
      timer = window.setTimeout(tick, msToNextMinute());
    }, msToNextMinute());
    return () => window.clearTimeout(timer);
  }, []);

  return (
    <div className="clock">
      <span className="clock-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24">
          <path d="M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
      <time dateTime={now.toISOString()} className="leading-tight">
        <span className="clock-time">
          {now.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
        </span>
        <span className="clock-date">
          {now.toLocaleDateString(dateLocale[locale], { weekday: "short", day: "numeric", month: "short" })} · {t.localTime}
        </span>
      </time>
    </div>
  );
}

export function LanguageSelect() {
  const { t, locale, setLocale } = useLocale();
  return (
    <label className="lang-select">
      <svg viewBox="0 0 24 24" className="lang-icon" aria-hidden="true">
        <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="sr-only">{t.language}</span>
      <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
        {locales.map((item) => (
          <option key={item.id} value={item.id}>
            {item.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AppShell({
  page,
  onNavigate,
  children,
}: {
  page: Page;
  onNavigate: (page: Page) => void;
  children: ReactNode;
}) {
  const { t, compact } = useLocale();
  const { user, signOut } = useAuth();
  const role = user?.role ?? "nurse";
  const workspaces = roleWorkspaces[role];

  if (role === "patient") {
    return (
      <div className="patient-shell">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:bg-card focus:px-3 focus:py-2">
          {t.skipToContent}
        </a>
        <header className="patient-topbar">
          <div className="flex items-center gap-3">
            <span className="brand-mark" style={{ background: "linear-gradient(135deg, #2dd4bf, #0f766e)" }}>
              <Heart />
            </span>
            <div>
              <p className="font-bold leading-tight">OPD Sentinel</p>
              <p className="text-xs text-slate-500">{t.navPortal}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {user ? (
              <span className="hidden text-sm font-semibold text-slate-600 sm:inline">
                {user.display_name} · <span className="text-teal-700">{t.rolePatient}</span>
              </span>
            ) : null}
            <LanguageSelect />
            <button type="button" className="signout-btn" onClick={() => void signOut()}>
              {t.signOut}
            </button>
          </div>
        </header>
        <main id="main" className="patient-main">
          {children}
        </main>
      </div>
    );
  }

  function itemButton(id: Page) {
    return (
      <button
        key={id}
        type="button"
        className="nav-btn"
        aria-current={page === id ? "page" : undefined}
        onClick={() => onNavigate(id)}
      >
        <svg viewBox="0 0 24 24" className="nav-icon" aria-hidden="true">
          <path d={icons[id]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="nav-label">{t[labels[id]]}</span>
      </button>
    );
  }

  return (
    <div className={compact ? "compact app-shell" : "app-shell"}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:bg-card focus:px-3 focus:py-2">
        {t.skipToContent}
      </a>
      <aside className="sidebar flex flex-col lg:min-h-screen">
        <div className="brand-row">
          <span className="brand-mark">
            <Heart />
          </span>
          <div className="nav-fade">
            <p className="text-base font-bold leading-tight text-white">OPD Sentinel</p>
            <p className="brand-sub text-xs">{t.tagline}</p>
          </div>
        </div>
        {user ? (
          <div className="sidebar-user nav-fade">
            <strong>{user.display_name}</strong>
            <span className="role-badge">{roleName(t, user.role)}</span>
          </div>
        ) : null}
        <p className="nav-kicker mt-2">
          <span className="nav-fade">{t.navWorkspaces}</span>
        </p>
        <nav className="nav-group flex gap-1 overflow-x-auto px-3 lg:flex-col" aria-label="Main">
          {workspaces.map(itemButton)}
        </nav>
        <p className="nav-kicker mt-4">
          <span className="nav-fade">{t.navSystem}</span>
        </p>
        <div className="nav-group flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col">
          {pagesFor(role).filter((id) => systemPages.includes(id)).map(itemButton)}
        </div>
        <p className="sidebar-note nav-fade">{t.sidebarNote}</p>
      </aside>
      <div className="min-w-0">
        <header className="topbar">
          <div>
            <p className="topbar-kicker">{t[sections[page]]}</p>
            <h1 className="text-xl font-bold tracking-tight">{t[labels[page]]}</h1>
            <p className="text-sm text-slate-500">{t[descriptions[page]]}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Clock />
            <LanguageSelect />
            <button type="button" className="signout-btn" onClick={() => void signOut()}>
              {t.signOut}
            </button>
          </div>
        </header>
        <main id="main" className="workspace">
          {children}
        </main>
      </div>
    </div>
  );
}
