'use client';

import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { apiFetch, setTokens, clearTokens } from '@/lib/api';
import { setPendingMfa, getPendingMfa, clearPendingMfa } from '@/lib/mfa';
import type { SessionUser } from '@/lib/auth-types';

interface AuthContextValue {
  user: SessionUser | null;
  loading: boolean;
  login: (username: string, password: string) => Promise<void>;
  verifyMfa: (token: string) => Promise<void>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (permission: string) => boolean;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const me = await apiFetch<SessionUser>('/auth/me', { cache: 'no-store' });
      setUser(me);
    } catch {
      setUser(null);
    }
  }, []);

  useEffect(() => {
    refresh().finally(() => setLoading(false));
  }, [refresh]);

  const login = useCallback(async (username: string, password: string) => {
    const res = await apiFetch<{
      accessToken?: string;
      refreshToken?: string;
      user?: SessionUser;
      twoFactorRequired?: boolean;
      pendingToken?: string;
    }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
      retryAuth: false,
    });
    if (res.twoFactorRequired && res.pendingToken) {
      setPendingMfa(res.pendingToken, username);
      router.replace('/login/mfa');
      return;
    }
    if (res.accessToken && res.refreshToken) {
      setTokens(res.accessToken, res.refreshToken);
    }
    setUser(res.user ?? null);
    router.replace('/');
  }, [router]);

  const verifyMfa = useCallback(async (token: string) => {
    const pending = getPendingMfa();
    if (!pending.token) {
      throw new Error('Two-factor challenge expired. Please sign in again.');
    }
    const res = await apiFetch<{ accessToken: string; refreshToken: string; user: SessionUser }>(
      '/auth/two-factor/verify',
      { method: 'POST', body: JSON.stringify({ pendingToken: pending.token, token }), retryAuth: false },
    );
    clearPendingMfa();
    if (res.accessToken && res.refreshToken) {
      setTokens(res.accessToken, res.refreshToken);
    }
    setUser(res.user);
    router.replace('/');
  }, [router]);

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST', retryAuth: false });
    } finally {
      clearTokens();
      setUser(null);
      router.replace('/login');
    }
  }, [router]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await apiFetch<{ accessToken: string; refreshToken: string; user: SessionUser }>(
      '/auth/change-password',
      { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }), retryAuth: false },
    );
    if (res.accessToken && res.refreshToken) {
      setTokens(res.accessToken, res.refreshToken);
    } else {
      clearTokens();
    }
    setUser(res.user ?? null);
  }, []);

  const { data: featureFlags } = useQuery<{ code: string; enabled: boolean }[]>({
    queryKey: ['features'],
    queryFn: () => apiFetch('/system/features'),
    enabled: !!user,
    staleTime: 30_000,
  });

  const disabledFeatures = useMemo(
    () => new Set((featureFlags ?? []).filter((f) => !f.enabled).map((f) => f.code)),
    [featureFlags],
  );

  const can = useCallback(
    (permission: string) => {
      if (!user) return false;
      const isDeveloper = user.roles?.includes('Developer') ?? false;
      // Switched-off features are hidden from everyone except the Developer role.
      if (!isDeveloper && disabledFeatures.has(permission)) return false;
      if (user.permissions.includes('*')) return true;
      return user.permissions.includes(permission);
    },
    [user, disabledFeatures],
  );

  const value = useMemo(
    () => ({ user, loading, login, verifyMfa, logout, refresh, can, changePassword }),
    [user, loading, login, verifyMfa, logout, refresh, can, changePassword],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}