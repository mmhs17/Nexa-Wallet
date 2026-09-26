import { createContext, useContext, useCallback, useEffect, useMemo, useState } from "react";
import api, { unwrap } from "../api/client.js";

const AuthCtx = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const hydrate = useCallback(async () => {
    const token = localStorage.getItem("nexa_access");
    if (!token) { setReady(true); return; }
    try {
      const res = await api.get("/auth/me");
      setUser(unwrap(res));
    } catch { localStorage.removeItem("nexa_access"); setUser(null); }
    finally { setReady(true); }
  }, []);

  useEffect(() => { hydrate(); }, [hydrate]);

  const login = useCallback(async ({ identifier, password }) => {
    const res = await api.post("/auth/login", { identifier, password });
    const data = unwrap(res);
    if (data?.twoFactorRequired) return { twoFactorRequired: true, pendingSessionId: data.pendingSessionId, user: data.user };
    if (data?.accessToken) localStorage.setItem("nexa_access", data.accessToken);
    setUser(data?.user || null);
    return { twoFactorRequired: false, user: data?.user };
  }, []);

  const verify2FA = useCallback(async ({ pendingSessionId, token, recoveryCode }) => {
    const res = await api.post("/auth/2fa/verify", { pendingSessionId, token, recoveryCode });
    const data = unwrap(res);
    if (data?.accessToken) localStorage.setItem("nexa_access", data.accessToken);
    setUser(data?.user || null);
    return data;
  }, []);

  const logout = useCallback(async (all = false) => {
    try { await api.post("/auth/logout", all ? { all: true } : {}); } catch { /* noop */ }
    localStorage.removeItem("nexa_access");
    setUser(null);
  }, []);

  const refreshMe = useCallback(async () => {
    try { const res = await api.get("/auth/me"); setUser(unwrap(res)); return unwrap(res); }
    catch { return null; }
  }, []);

  const value = useMemo(() => ({ user, setUser, ready, login, verify2FA, logout, refreshMe }), [user, ready, login, verify2FA, logout, refreshMe]);
  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
