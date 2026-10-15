import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { apiPost, setAuthToken, setUnauthorizedHandler, type StaffUser } from "../api/client";

type Session = { token: string; user: StaffUser; expires_at: string };

type AuthState = {
  user: StaffUser | null;
  signIn: (username: string, password: string) => Promise<void>;
  signUp: (username: string, displayName: string, password: string) => Promise<void>;
  quickSignIn: (username: string) => Promise<void>;
  signOut: () => Promise<void>;
  expired: boolean;
};

const STORAGE_KEY = "opd-sentinel-session";

const AuthContext = createContext<AuthState>({
  user: null,
  signIn: async () => undefined,
  signUp: async () => undefined,
  quickSignIn: async () => undefined,
  signOut: async () => undefined,
  expired: false,
});

function readStored(): Session | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as Session;
    if (!session.token || new Date(session.expires_at).getTime() <= Date.now()) return null;
    return session;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const client = useQueryClient();
  const [session, setSession] = useState<Session | null>(() => {
    const stored = readStored();
    setAuthToken(stored?.token ?? null);
    return stored;
  });
  const [expired, setExpired] = useState(false);

  const clear = useCallback(() => {
    window.sessionStorage.removeItem(STORAGE_KEY);
    setAuthToken(null);
    setSession(null);
    client.clear();
  }, [client]);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      setExpired(true);
      clear();
    });
    return () => setUnauthorizedHandler(null);
  }, [clear]);

  const start = useCallback(
    (next: Session) => {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setAuthToken(next.token);
      setExpired(false);
      client.clear();
      setSession(next);
    },
    [client],
  );

  const signIn = useCallback(
    async (username: string, password: string) => {
      start(await apiPost<Session>("/auth/login", { username, password }));
    },
    [start],
  );

  const signUp = useCallback(
    async (username: string, displayName: string, password: string) => {
      start(
        await apiPost<Session>("/auth/register-patient", {
          username,
          display_name: displayName,
          password,
        }),
      );
    },
    [start],
  );

  const quickSignIn = useCallback(
    async (username: string) => {
      start(await apiPost<Session>("/auth/demo-login", { username }));
    },
    [start],
  );

  const signOut = useCallback(async () => {
    try {
      await apiPost("/auth/logout");
    } catch {
      // The token is dropped locally either way.
    }
    setExpired(false);
    clear();
  }, [clear]);

  const value = useMemo(
    () => ({ user: session?.user ?? null, signIn, signUp, quickSignIn, signOut, expired }),
    [session, signIn, signUp, quickSignIn, signOut, expired],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
