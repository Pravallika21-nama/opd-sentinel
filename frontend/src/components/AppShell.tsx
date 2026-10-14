import type { ReactNode } from "react";
import { useLocale, type Locale } from "../lib/i18n";

export type Page =
  | "live"
  | "queue"
  | "records"
  | "rules"
  | "evaluation"
  | "audit"
  | "settings";

const locales: Locale[] = ["en", "hi", "te"];

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
  const items: { id: Page; label: string }[] = [
    { id: "live", label: t.live },
    { id: "queue", label: t.queue },
    { id: "records", label: t.records },
    { id: "rules", label: t.rules },
    { id: "evaluation", label: t.evaluation },
    { id: "audit", label: t.auditNav },
    { id: "settings", label: t.settings },
  ];

  return (
    <div className={compact ? "compact min-h-screen" : "min-h-screen"}>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-20 focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>
      <div className="lg:grid lg:grid-cols-[15rem_1fr]">
        <aside className="border-b border-line bg-navy text-white lg:min-h-screen lg:border-b-0 lg:border-r">
          <div className="px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-sky-100">OPD operations</p>
            <p className="text-xl font-semibold">OPD Sentinel</p>
            <p className="mt-1 text-sm text-sky-100">Decision support. A nurse confirms every case.</p>
          </div>
          <nav className="flex gap-1 overflow-x-auto px-2 pb-3 lg:flex-col lg:px-3" aria-label="Main">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`min-h-11 shrink-0 rounded-md px-3 text-left text-sm font-semibold ${
                  page === item.id ? "bg-white text-navy" : "text-white hover:bg-white/10"
                }`}
                aria-current={page === item.id ? "page" : undefined}
                onClick={() => onNavigate(item.id)}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </aside>
        <div className="min-w-0">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-card px-4 py-3">
            <p className="text-sm text-ink">Does not diagnose. Does not replace a doctor.</p>
            <div className="flex gap-2" role="group" aria-label="Language">
              {locales.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`min-h-10 rounded-md border px-3 text-sm font-semibold ${
                    item === locale ? "border-action bg-action text-white" : "border-line bg-card"
                  }`}
                  aria-pressed={item === locale}
                  onClick={() => setLocale(item)}
                >
                  {item.toUpperCase()}
                </button>
              ))}
            </div>
          </header>
          <main id="main" className="px-4 py-4">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
