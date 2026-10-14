import type { ReactNode } from "react";
import { useLocale, type Locale } from "../lib/i18n";

export type Page = "intake" | "queue" | "rules" | "evaluation" | "status" | "case";

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
  const { t, locale, setLocale } = useLocale();
  const items: { id: Page; label: string }[] = [
    { id: "intake", label: t.intake },
    { id: "queue", label: t.queue },
    { id: "rules", label: t.rules },
    { id: "evaluation", label: t.evaluation },
    { id: "status", label: t.status },
  ];
  return (
    <div className="min-h-screen">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <header className="border-b border-line bg-card">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wide text-teal">Decision support</p>
            <p className="text-2xl font-semibold">OPD Sentinel</p>
          </div>
          <div className="flex gap-2" role="group" aria-label="Language">
            {locales.map((item) => (
              <button
                key={item}
                type="button"
                className={`min-h-11 rounded-md border px-3 ${item === locale ? "bg-teal text-white" : "bg-card"}`}
                aria-pressed={item === locale}
                onClick={() => setLocale(item)}
              >
                {item.toUpperCase()}
              </button>
            ))}
          </div>
        </div>
        <nav className="mx-auto flex max-w-6xl gap-2 overflow-x-auto px-4 pb-4" aria-label="Main">
          {items.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`min-h-11 rounded-md px-4 font-semibold ${page === item.id ? "bg-teal text-white" : "bg-paper"}`}
              aria-current={page === item.id ? "page" : undefined}
              onClick={() => onNavigate(item.id)}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </header>
      <main id="main" className="mx-auto max-w-6xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
