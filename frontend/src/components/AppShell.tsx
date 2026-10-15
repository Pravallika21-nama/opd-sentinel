import { useEffect, useState, type ReactNode } from "react";
import { useLocale, type Locale } from "../lib/i18n";

export type Page =
  | "home"
  | "live"
  | "queue"
  | "records"
  | "doctor"
  | "evaluation"
  | "rules"
  | "audit"
  | "settings";

const locales: { id: Locale; label: string }[] = [
  { id: "en", label: "English" },
  { id: "hi", label: "हिन्दी (Hindi)" },
  { id: "te", label: "తెలుగు (Telugu)" },
];

const descriptions: Record<Page, string> = {
  home: "Who needs Nurse Review next, and how busy the station is today.",
  live: "Enter what the patient tells you. OPD Sentinel suggests a level. You make the decision.",
  queue: "Ordered by safety-adjusted urgency, then earlier arrival.",
  records: "Stored intake, model suggestion, and Nurse Review.",
  doctor: "Cases a nurse has already decided, grouped for the doctor. This view does not change urgency.",
  evaluation: "How well each model found emergencies on a held-out test, explained in plain language.",
  rules: "Safety rules can keep or raise urgency. They cannot downgrade it.",
  audit: "Append-only record of triage and Nurse Review.",
  settings: "Language, display, and what this station can see.",
};

const sections: Record<Page, string> = {
  home: "Nurse workspace",
  live: "Nurse workspace",
  queue: "Nurse workspace",
  records: "Nurse workspace",
  doctor: "Doctor handoff",
  evaluation: "Research",
  rules: "Safety",
  audit: "System",
  settings: "System",
};

const icons: Record<Page, string> = {
  home: "M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6H10v6H5a1 1 0 0 1-1-1z",
  live: "M12 8v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18",
  queue: "M8 6h13M8 12h13M8 18h13M4 6h.01M4 12h.01M4 18h.01",
  records: "M7 3h8l4 4v14H7zM15 3v4h4",
  doctor: "M8 21v-2a4 4 0 0 1 4-4h0a4 4 0 0 1 4 4v2M12 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  rules: "M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6z",
  evaluation: "M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-2",
  audit: "M8 4h8v16H8zM10 8h4M10 12h4",
  settings: "M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7M12 3v2M12 19v2M4.9 6.5l1.7 1M17.4 16.5l1.7 1M3 12h2M19 12h2M4.9 17.5l1.7-1M17.4 7.5l1.7-1",
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
          {now.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })} · Local time
        </span>
      </time>
    </div>
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
  const { t, locale, setLocale, compact } = useLocale();

  const workspaces: { id: Page; label: string }[] = [
    { id: "home", label: t.home },
    { id: "live", label: t.live },
    { id: "queue", label: t.queue },
    { id: "records", label: t.records },
    { id: "doctor", label: t.doctor },
    { id: "evaluation", label: t.evaluation },
    { id: "rules", label: t.rules },
  ];
  const system: { id: Page; label: string }[] = [
    { id: "audit", label: t.auditNav },
    { id: "settings", label: t.settings },
  ];
  const current = [...workspaces, ...system].find((item) => item.id === page);

  function itemButton(item: { id: Page; label: string }) {
    return (
      <button
        key={item.id}
        type="button"
        className="nav-btn"
        aria-current={page === item.id ? "page" : undefined}
        onClick={() => onNavigate(item.id)}
      >
        <svg viewBox="0 0 24 24" className="nav-icon" aria-hidden="true">
          <path d={icons[item.id]} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="nav-label">{item.label}</span>
      </button>
    );
  }

  return (
    <div className={compact ? "compact app-shell" : "app-shell"}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="sidebar flex flex-col lg:min-h-screen">
        <div className="brand-row">
          <span className="brand-mark">
            <Heart />
          </span>
          <div className="nav-fade">
            <p className="text-base font-bold leading-tight">OPD Sentinel</p>
            <p className="text-xs text-slate-500">Triage decision support</p>
          </div>
        </div>
        <p className="nav-kicker">
          <span className="nav-fade">Workspaces</span>
        </p>
        <nav className="nav-group flex gap-1 overflow-x-auto px-3 lg:flex-col" aria-label="Main">
          {workspaces.map(itemButton)}
        </nav>
        <p className="nav-kicker mt-4">
          <span className="nav-fade">System</span>
        </p>
        <div className="nav-group flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col">{system.map(itemButton)}</div>
        <p className="sidebar-note nav-fade">Decision support only. A nurse confirms every recommendation.</p>
      </aside>
      <div className="min-w-0">
        <header className="topbar">
          <div>
            <p className="topbar-kicker">{sections[page]}</p>
            <h1 className="text-xl font-bold tracking-tight">{current?.label ?? "OPD Sentinel"}</h1>
            <p className="text-sm text-slate-500">{descriptions[page]}</p>
          </div>
          <div className="flex items-center gap-3">
            <Clock />
            <label className="lang-select">
              <svg viewBox="0 0 24 24" className="lang-icon" aria-hidden="true">
                <path d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span className="sr-only">Language</span>
              <select value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
                {locales.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </header>
        <main id="main" className="workspace">
          {children}
        </main>
      </div>
    </div>
  );
}
