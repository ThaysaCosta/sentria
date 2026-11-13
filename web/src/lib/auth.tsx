import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ApiError, api, setUnauthorizedHandler, tokenStore } from './api';
import type { User } from './types';

interface AuthCtx {
  user: User | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Atualiza a sessão (ex.: após trocar a senha, o servidor devolve um token novo). */
  setSession: (token: string, user: User) => void;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) {
      setReady(true);
      return;
    }
    // Só uma resposta 401 encerra a sessão; falhas de rede (ex.: servidor reiniciando) tentam de novo.
    let cancelled = false;
    const check = (attempt = 0) => {
      api<{ user: User }>('/auth/me')
        .then((r) => {
          if (!cancelled) setUser(r.user);
          if (!cancelled) setReady(true);
        })
        .catch((e) => {
          if (cancelled) return;
          if (e instanceof ApiError && e.status === 401) {
            tokenStore.set(null);
            setReady(true);
          } else if (attempt < 5) {
            setTimeout(() => check(attempt + 1), 800 * (attempt + 1));
          } else {
            setReady(true);
          }
        });
    };
    check();
    return () => {
      cancelled = true;
    };
  }, [logout]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api<{ token: string; user: User }>('/auth/login', { body: { email, password } });
    tokenStore.set(r.token);
    setUser(r.user);
  }, []);

  const setSession = useCallback((token: string, u: User) => {
    tokenStore.set(token);
    setUser(u);
  }, []);

  const value = useMemo(() => ({ user, ready, login, logout, setSession }), [user, ready, login, logout, setSession]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('useAuth fora do AuthProvider');
  return ctx;
}
