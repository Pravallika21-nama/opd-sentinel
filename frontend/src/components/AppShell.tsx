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

const locales: Locale[] = ["en", "hi", "te"];

const descriptions: Record<Page, string> = {
  home: "Current station. Arrival counts and the waiting queue are separate.",
  live: "Enter the complaint as spoken. A recommendation is not a confirmed decision.",
  queue: "Ordered by safety-adjusted urgency, then earlier arrival.",
  records: "Stored intake, model suggestion, and Nurse Review.",
  doctor: "Cases a nurse has already decided, grouped for the doctor. This view does not change urgency.",
  evaluation: "Classical ML, experimental Quantum ML, and dataset status. Missing figures stay pending.",
  rules: "Safety rules can keep or raise urgency. They cannot downgrade it.",
  audit: "Append-only record of triage and Nurse Review.",
  settings: "Language, display, and what this station can see.",
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
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), 30000);
    return () => window.clearInterval(timer);
  }, []);

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
        {item.label}
      </button>
    );
  }

  return (
    <div className={compact ? "compact app-shell" : "app-shell"}>
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="sidebar flex flex-col lg:min-h-screen">
        <div className="flex items-center gap-3 px-4 py-5">
          <span className="brand-mark">
            <Heart />
          </span>
          <div>
            <p className="text-base font-semibold leading-tight">OPD Sentinel</p>
            <p className="text-xs text-sky-200">Clinical support</p>
          </div>
        </div>
        <p className="nav-kicker">Workspaces</p>
        <nav className="flex gap-1 overflow-x-auto px-3 lg:flex-col" aria-label="Main">
          {workspaces.map(itemButton)}
        </nav>
        <p className="nav-kicker mt-4">System</p>
        <div className="flex gap-1 overflow-x-auto px-3 pb-4 lg:flex-col">{system.map(itemButton)}</div>
        <p className="mt-auto hidden px-4 py-4 text-xs leading-relaxed text-sky-200 lg:block">
          Decision support only. A nurse confirms every recommendation.
        </p>
      </aside>
      <div className="min-w-0">
        <header className="topbar">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {page === "doctor" ? "Doctor handoff" : "Nurse station"}
            </p>
            <h1 className="text-xl font-semibold">{current?.label ?? "OPD Sentinel"}</h1>
            <p className="text-sm text-slate-500">{descriptions[page]}</p>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-sm font-semibold tabular-nums">
              {now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </p>
            <div className="flex gap-2" role="group" aria-label="Language">
              {locales.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`min-h-10 rounded-full border px-3 text-sm font-semibold ${
                    item === locale ? "border-action bg-action text-white" : "border-line bg-card"
                  }`}
                  aria-pressed={item === locale}
                  onClick={() => setLocale(item)}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </header>
        <main id="main" className="workspace">
          {children}
        </main>
      </div>
    </div>
  );
}
