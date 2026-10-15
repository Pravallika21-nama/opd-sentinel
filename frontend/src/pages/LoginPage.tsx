import { useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { ApiError, apiGet, fieldErrorFor, type Role } from "../api/client";
import { LanguageSelect, roleName } from "../components/AppShell";
import { Icon, PasswordInput, type IconName } from "../components/ui";
import { useAuth } from "../lib/auth";
import { useLocale } from "../lib/i18n";

type Mode = "signin" | "signup";

type DemoAccount = { username: string; display_name: string; role: Role };

const roleIcons: Record<Role, IconName> = { nurse: "clipboard", doctor: "stethoscope", admin: "chart", patient: "heart" };

function QuickSignIn({ accounts }: { accounts: DemoAccount[] }) {
  const { t } = useLocale();
  const { quickSignIn } = useAuth();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function go(username: string) {
    setBusy(username);
    setError(null);
    try {
      await quickSignIn(username);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
      setBusy(null);
    }
  }

  return (
    <section aria-labelledby="quick-title" className="mt-4">
      <p id="quick-title" className="text-sm font-bold">
        {t.lgQuick}
      </p>
      <p className="text-xs text-slate-500">{t.lgQuickHint}</p>
      <div className="quick-grid mt-2">
        {accounts.map((account) => (
          <button
            key={account.username}
            type="button"
            className={`quick-card role-${account.role}`}
            disabled={busy !== null}
            onClick={() => void go(account.username)}
          >
            <span className="quick-card__icon">
              <Icon name={roleIcons[account.role]} className="h-5 w-5" />
            </span>
            <span className="min-w-0 text-left">
              <span className="block font-bold">{roleName(t, account.role)}</span>
              <span className="block truncate text-xs text-slate-500">{busy === account.username ? t.signingIn : account.username}</span>
            </span>
          </button>
        ))}
      </div>
      {error ? (
        <p className="error-note mt-2" role="alert">
          {error}
        </p>
      ) : null}
      <p className="quick-divider mt-4">
        <span>{t.lgOr}</span>
      </p>
    </section>
  );
}

function SignInForm({ accounts }: { accounts: DemoAccount[] }) {
  const { t } = useLocale();
  const { signIn, expired } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await signIn(username.trim(), password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)} aria-labelledby="login-title">
      <h1 id="login-title" className="text-xl font-bold">
        {t.signInTitle}
      </h1>
      <p className="section-sub">{t.lgSignInSub}</p>
      {expired ? <p className="notice mt-4">{t.sessionExpired}</p> : null}
      {accounts.length ? <QuickSignIn accounts={accounts} /> : null}
      <div className="mt-4 grid gap-3">
        <label className="field-label">
          {t.username}
          <input className="field" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} required />
        </label>
        <label className="field-label">
          {t.password}
          <PasswordInput autoComplete="current-password" value={password} onChange={setPassword} required />
        </label>
      </div>
      {error ? (
        <p className="error-note mt-3" role="alert">
          {error}
        </p>
      ) : null}
      <button type="submit" className="btn-primary mt-4 w-full" disabled={busy || !username || !password}>
        {busy ? t.signingIn : t.signIn}
      </button>
      <p className="mt-4 text-xs leading-relaxed text-slate-500">{t.lgDemo}</p>
    </form>
  );
}

function SignUpForm() {
  const { t } = useLocale();
  const { signUp } = useAuth();
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const mismatch = confirm.length > 0 && confirm !== password;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (mismatch) return;
    setBusy(true);
    setError(null);
    try {
      await signUp(username.trim().toLowerCase(), name.trim(), password);
    } catch (caught) {
      setError(caught);
    } finally {
      setBusy(false);
    }
  }

  const fieldError = (field: string) => fieldErrorFor(error, field);

  return (
    <form onSubmit={(event) => void submit(event)} aria-labelledby="signup-title">
      <h1 id="signup-title" className="text-xl font-bold">
        {t.lgSignUpTitle}
      </h1>
      <p className="section-sub">{t.lgSignUpSub}</p>
      <div className="mt-4 grid gap-3">
        <label className="field-label">
          {t.lgFullName}
          <input className="field" autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} required minLength={2} />
          {fieldError("display_name") ? <span className="form-error">{fieldError("display_name")}</span> : null}
        </label>
        <label className="field-label">
          {t.username}
          <input
            className="field"
            autoComplete="username"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            required
            minLength={3}
            maxLength={32}
            aria-describedby="username-rule"
          />
          <span id="username-rule" className="text-xs font-normal text-slate-500">
            {t.lgUsernameRule}
          </span>
          {fieldError("username") ? <span className="form-error">{fieldError("username")}</span> : null}
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field-label">
            {t.password}
            <PasswordInput autoComplete="new-password" value={password} onChange={setPassword} required minLength={8} />
            <span className="text-xs font-normal text-slate-500">{t.lgPasswordRule}</span>
          </label>
          <label className="field-label">
            {t.lgConfirm}
            <PasswordInput autoComplete="new-password" value={confirm} onChange={setConfirm} required aria-invalid={mismatch} />
            {mismatch ? <span className="form-error">{t.lgMismatch}</span> : null}
          </label>
        </div>
      </div>
      {error instanceof ApiError && error.fieldErrors.length === 0 ? (
        <p className="error-note mt-3" role="alert">
          {error.message}
        </p>
      ) : null}
      <button type="submit" className="btn-teal mt-4 w-full" disabled={busy || mismatch || password.length < 8 || !name.trim() || username.trim().length < 3}>
        {busy ? t.lgCreating : t.lgCreate}
      </button>
      <p className="mt-3 text-xs leading-relaxed text-slate-500">{t.lgPrivacy}</p>
    </form>
  );
}

export function LoginPage() {
  const { t } = useLocale();
  const [mode, setMode] = useState<Mode>("signin");
  const options = useQuery({
    queryKey: ["auth-options"],
    queryFn: () => apiGet<{ patient_signup: boolean; demo_accounts?: DemoAccount[] }>("/auth/options"),
    staleTime: 60_000,
  });
  const signupAllowed = options.data?.patient_signup === true;
  const points: [IconName, string][] = [
    ["phone", t.lgPoint1],
    ["shield", t.lgPoint2],
    ["database", t.lgPoint3],
  ];

  return (
    <div className="login-wrap">
      <section className="login-hero" aria-hidden="false">
        <div className="relative z-10 flex items-center gap-3">
          <span className="brand-mark">
            <Icon name="heart" className="h-5 w-5" />
          </span>
          <div>
            <p className="text-lg font-bold">OPD Sentinel</p>
            <p className="text-xs text-sky-200">{t.tagline}</p>
          </div>
        </div>
        <div className="relative z-10">
          <svg viewBox="0 0 420 80" className="login-ecg" aria-hidden="true">
            <path
              d="M0 40h90l12-18 14 36 16-62 16 70 12-26h70l10-12 10 12h170"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          <h2 className="mt-4 max-w-xl text-3xl font-extrabold leading-tight tracking-tight lg:text-4xl">{t.lgHeroTitle}</h2>
          <p className="mt-3 max-w-xl text-sky-100">{t.lgHeroSub}</p>
          <ul className="stagger mt-6 grid gap-3">
            {points.map(([icon, text]) => (
              <li key={text} className="login-point">
                <span className="login-point__icon">
                  <Icon name={icon} />
                </span>
                <span className="pt-1.5 text-sm">{text}</span>
              </li>
            ))}
          </ul>
        </div>
        <p className="relative z-10 text-xs text-sky-200">{t.lgPrivacy}</p>
      </section>
      <div className="login-side">
        <div className="login-card">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            {signupAllowed ? (
              <div className="tabs" role="tablist" aria-label={t.signIn}>
                <button type="button" role="tab" aria-selected={mode === "signin"} onClick={() => setMode("signin")}>
                  {t.lgTabSignIn}
                </button>
                <button type="button" role="tab" aria-selected={mode === "signup"} onClick={() => setMode("signup")}>
                  {t.lgTabSignUp}
                </button>
              </div>
            ) : (
              <p className="topbar-kicker">OPD Sentinel</p>
            )}
            <LanguageSelect />
          </div>
          {mode === "signup" && signupAllowed ? <SignUpForm /> : <SignInForm accounts={options.data?.demo_accounts ?? []} />}
        </div>
      </div>
    </div>
  );
}
