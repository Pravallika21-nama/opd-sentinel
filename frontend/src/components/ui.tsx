import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocale } from "../lib/i18n";

const iconPaths = {
  pulse: "M3 12h4l2-6 4 12 2-6h6",
  users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 19v-1a4 4 0 0 0-3-3.9M15.5 4.1a3 3 0 0 1 0 5.8",
  clock: "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18",
  alert: "M12 9v4M12 17h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  stethoscope: "M6 3v6a4 4 0 0 0 8 0V3M10 13v3a5 5 0 0 0 10 0v-2M20 12a2 2 0 1 0 0-4 2 2 0 0 0 0 4",
  check: "M20 6 9 17l-5-5",
  heart: "M12 20.5s-6.2-4-8.6-7.8C1.6 9.8 2.4 6.8 5 5.6c2-.9 4.1-.2 5.4 1.6L12 9l1.6-1.8c1.3-1.8 3.4-2.5 5.4-1.6 2.6 1.2 3.4 4.2 1.6 7.1-2.4 3.8-8.6 7.8-8.6 7.8z",
  thermo: "M14 14.8V5a2 2 0 0 0-4 0v9.8a4 4 0 1 0 4 0",
  pill: "M10.5 20.5 3.5 13.5a5 5 0 0 1 7-7l7 7a5 5 0 0 1-7 7M8.5 8.5l7 7",
  clipboard: "M9 4h6v3H9zM9 5H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V6a1 1 0 0 0-1-1h-3M9 12h6M9 16h4",
  chart: "M4 19V5M4 19h16M8 15v-4M12 15V8M16 15v-2",
  database: "M12 8c4.4 0 8-1.3 8-3s-3.6-3-8-3-8 1.3-8 3 3.6 3 8 3M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3",
  inbox: "M22 12h-6l-2 3h-4l-2-3H2M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1",
  phone: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.5c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2",
  shield: "M12 3 5 6v6c0 4 3 6.5 7 8 4-1.5 7-4 7-8V6z",
  user: "M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M12 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M3.6 9h16.8M3.6 15h16.8M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18",
  send: "M22 2 11 13M22 2l-7 20-4-9-9-4z",
  plus: "M12 5v14M5 12h14",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  eyeOff:
    "M9.9 4.2A9.6 9.6 0 0 1 12 4c6.4 0 10 8 10 8a17.6 17.6 0 0 1-2.2 3.2M6.6 6.6A17 17 0 0 0 2 12s3.6 8 10 8a9.4 9.4 0 0 0 5.4-1.6M9.9 9.9a3 3 0 0 0 4.2 4.2M2 2l20 20",
} as const;

export type IconName = keyof typeof iconPaths;

export function Icon({ name, className = "h-5 w-5" }: { name: IconName; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path d={iconPaths[name]} fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
}

export function AnimatedNumber({ value, decimals = 0 }: { value: number; decimals?: number }) {
  const [shown, setShown] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    const start = from.current;
    if (start === value || prefersReducedMotion() || typeof requestAnimationFrame === "undefined") {
      from.current = value;
      setShown(value);
      return;
    }
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - began) / 650);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(start + (value - start) * eased);
      if (progress < 1) frame = requestAnimationFrame(step);
      else from.current = value;
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [value]);
  return <>{shown.toFixed(decimals)}</>;
}

export function LiveBadge({ updatedAt, fetching }: { updatedAt: number; fetching: boolean }) {
  const { t } = useLocale();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 5000);
    return () => window.clearInterval(timer);
  }, []);
  const seconds = updatedAt ? Math.max(0, Math.round((now - updatedAt) / 1000)) : 0;
  return (
    <span className="live-badge" aria-live="off">
      <span className={fetching ? "live-dot is-busy" : "live-dot"} aria-hidden="true" />
      <strong>{t.uiLive}</strong>
      <span>{fetching ? t.uiRefreshing : t.uiUpdatedAgo(seconds)}</span>
    </span>
  );
}

export function PageHero({
  kicker,
  title,
  subtitle,
  icon,
  actions,
  aside,
  tone = "sky",
}: {
  kicker?: string;
  title: ReactNode;
  subtitle?: ReactNode;
  icon?: IconName;
  actions?: ReactNode;
  aside?: ReactNode;
  tone?: "sky" | "teal" | "violet" | "navy";
}) {
  return (
    <section className={`page-hero tone-${tone}`}>
      <div className="page-hero__main">
        {icon ? (
          <span className="page-hero__icon">
            <Icon name={icon} className="h-6 w-6" />
          </span>
        ) : null}
        <div className="min-w-0">
          {kicker ? <p className="page-hero__kicker">{kicker}</p> : null}
          <h2 className="page-hero__title">{title}</h2>
          {subtitle ? <p className="page-hero__sub">{subtitle}</p> : null}
          {actions ? <div className="mt-3 flex flex-wrap gap-2">{actions}</div> : null}
        </div>
      </div>
      {aside ? <div className="page-hero__aside">{aside}</div> : null}
    </section>
  );
}

export function PasswordInput({
  value,
  onChange,
  autoComplete,
  ...rest
}: {
  value: string;
  onChange: (value: string) => void;
  autoComplete: "current-password" | "new-password";
  required?: boolean;
  minLength?: number;
  "aria-invalid"?: boolean;
}) {
  const { t } = useLocale();
  const [visible, setVisible] = useState(false);
  return (
    <span className="password-field">
      <input
        className="field"
        type={visible ? "text" : "password"}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        spellCheck={false}
        autoCapitalize="none"
        {...rest}
      />
      <button
        type="button"
        className="password-toggle"
        onClick={() => setVisible(!visible)}
        aria-label={visible ? t.lgHidePassword : t.lgShowPassword}
        aria-pressed={visible}
        title={visible ? t.lgHidePassword : t.lgShowPassword}
      >
        <Icon name={visible ? "eyeOff" : "eye"} className="h-5 w-5" />
      </button>
    </span>
  );
}

export function Skeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  return (
    <div className={`flex flex-col gap-2 ${className}`} aria-hidden="true">
      {Array.from({ length: lines }, (_, index) => (
        <span key={index} className="skeleton" style={{ width: `${92 - ((index * 17) % 40)}%` }} />
      ))}
    </div>
  );
}

export function SkeletonCards({ count = 4, className = "" }: { count?: number; className?: string }) {
  return (
    <div className={`kpi-grid ${className}`} aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="kpi-card">
          <span className="skeleton w-1/2" />
          <span className="skeleton mt-3 h-7 w-1/3" />
          <span className="skeleton mt-2 w-3/4" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({ icon = "inbox", title, body, action }: { icon?: IconName; title: string; body?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <span className="empty-state__icon">
        <Icon name={icon} className="h-7 w-7" />
      </span>
      <p className="font-semibold">{title}</p>
      {body ? <p className="max-w-md text-sm text-slate-500">{body}</p> : null}
      {action}
    </div>
  );
}

export type Segment = { label: string; value: number; color: string };

export function Donut({ segments, center, caption, size = 168 }: { segments: Segment[]; center: ReactNode; caption?: string; size?: number }) {
  const total = segments.reduce((sum, item) => sum + item.value, 0);
  const radius = 15.915;
  let offset = 25;
  return (
    <figure className="donut">
      <div className="donut__ring" style={{ width: size, height: size }}>
        <svg viewBox="0 0 42 42" role="img" aria-label={caption}>
          <circle cx="21" cy="21" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="5" />
          {total > 0
            ? segments.map((item) => {
                const share = (item.value / total) * 100;
                const dash = `${share} ${100 - share}`;
                const circle = (
                  <circle
                    key={item.label}
                    className="donut__segment"
                    cx="21"
                    cy="21"
                    r={radius}
                    fill="none"
                    stroke={item.color}
                    strokeWidth="5"
                    strokeDasharray={dash}
                    strokeDashoffset={offset}
                  >
                    <title>{`${item.label}: ${item.value}`}</title>
                  </circle>
                );
                offset -= share;
                return circle;
              })
            : null}
        </svg>
        <div className="donut__center">{center}</div>
      </div>
      <figcaption className="donut__legend">
        {segments.map((item) => (
          <span key={item.label}>
            <i style={{ background: item.color }} aria-hidden="true" />
            {item.label}
            <b>{item.value}</b>
          </span>
        ))}
      </figcaption>
    </figure>
  );
}

export type BarRow = { label: string; value: number; display?: string; tone?: string; note?: string };

export function BarList({ rows, max, label }: { rows: BarRow[]; max?: number; label: string }) {
  const top = max ?? Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="bar-chart" role="img" aria-label={label}>
      {rows.map((row) => (
        <div key={row.label} className="bar-row" title={row.note ?? `${row.label}: ${row.display ?? row.value}`}>
          <span className="truncate">{row.label}</span>
          <span className="bar-track" aria-hidden="true">
            <span className={`bar-fill grow-in ${row.tone ?? ""}`} style={{ width: `${Math.max(0, Math.min(1, row.value / top)) * 100}%` }} />
          </span>
          <span className="bar-value">{row.display ?? row.value}</span>
        </div>
      ))}
    </div>
  );
}

export function RangeBars({
  rows,
  label,
  unit,
  max,
}: {
  rows: { label: string; q1: number | null; median: number | null; q3: number | null; tone?: string }[];
  label: string;
  unit: (value: number) => string;
  max?: number;
}) {
  const values = rows.flatMap((row) => [row.q3 ?? 0, row.median ?? 0]);
  const top = max ?? Math.max(1, ...values);
  const at = (value: number) => Math.min(100, (value / top) * 100);
  return (
    <div className="range-chart" role="img" aria-label={label}>
      {rows.map((row) => (
        <div key={row.label} className="range-row">
          <span className="truncate">{row.label}</span>
          <span className="range-track" aria-hidden="true">
            {row.q1 !== null && row.q3 !== null ? (
              <span
                className={`range-band ${row.tone ?? ""}`}
                style={{ left: `${at(row.q1)}%`, width: `${Math.max(1, at(row.q3) - at(row.q1))}%` }}
              />
            ) : null}
            {row.median !== null ? <span className="range-median" style={{ left: `${at(row.median)}%` }} /> : null}
          </span>
          <span className="bar-value whitespace-nowrap">{row.median === null ? "—" : unit(row.median)}</span>
        </div>
      ))}
    </div>
  );
}

export function StackBar({ segments, label }: { segments: Segment[]; label: string }) {
  const total = Math.max(1, segments.reduce((sum, item) => sum + item.value, 0));
  return (
    <div>
      <div className="stack-bar" role="img" aria-label={label}>
        {segments.map((item) => (
          <span key={item.label} className="grow-in" style={{ width: `${(item.value / total) * 100}%`, background: item.color }} title={`${item.label}: ${item.value}`} />
        ))}
      </div>
      <div className="donut__legend mt-2">
        {segments.map((item) => (
          <span key={item.label}>
            <i style={{ background: item.color }} aria-hidden="true" />
            {item.label}
            <b>
              {item.value} · {Math.round((item.value / total) * 100)}%
            </b>
          </span>
        ))}
      </div>
    </div>
  );
}

export function Stepper({ steps, current, failed }: { steps: string[]; current: number; failed?: boolean }) {
  return (
    <ol className="stepper">
      {steps.map((step, index) => {
        const state = index < current ? "done" : index === current ? (failed ? "failed" : "current") : "todo";
        return (
          <li key={step} className={`stepper__item is-${state}`} aria-current={state === "current" ? "step" : undefined}>
            <span className="stepper__dot">{state === "done" ? <Icon name="check" className="h-3.5 w-3.5" /> : index + 1}</span>
            <span className="stepper__label">{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

export const levelColors: Record<number, string> = {
  1: "#a3141f",
  2: "#dc5a1e",
  3: "#d4a017",
  4: "#0284c7",
  5: "#15803d",
};
