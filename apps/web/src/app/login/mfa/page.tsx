'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/context/auth-context';
import { ApiError } from '@/lib/api';
import { getPendingMfa } from '@/lib/mfa';
import { Building2, Loader2, ShieldCheck } from 'lucide-react';

export default function TwoFactorVerifyPage() {
  const { verifyMfa } = useAuth();
  const { username } = getPendingMfa();
  const [token, setToken] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await verifyMfa(token.trim());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed. Try again.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-4">
      <div className="pointer-events-none absolute -left-32 -top-32 h-96 w-96 rounded-full bg-teal-600/20 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-32 -right-32 h-96 w-96 rounded-full bg-slate-700/30 blur-3xl" />

      <div className="relative w-full max-w-md">
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-700 text-white shadow-lg shadow-teal-900/50">
            <Building2 className="h-7 w-7" />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-bold tracking-tight text-white">HAS ERP</h1>
            <p className="text-sm text-slate-400">Two-factor verification</p>
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-8 shadow-2xl backdrop-blur-xl">
          <div className="mb-6 flex flex-col items-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-teal-500/15">
              <ShieldCheck className="h-6 w-6 text-teal-400" />
            </div>
            <h2 className="text-lg font-semibold text-white">
              {username ? `Hi ${username}, ` : ''}enter your code
            </h2>
            <p className="mt-1 text-sm text-slate-400">
              Open your authenticator app and enter the 6-digit code. You can also use a recovery code.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <input
                value={token}
                onChange={(e) => setToken(e.target.value)}
                autoFocus
                required
                inputMode="numeric"
                maxLength={24}
                placeholder="000000"
                className="w-full rounded-lg border border-white/10 bg-slate-950/60 py-3 text-center font-mono text-2xl tracking-[0.5em] text-white placeholder-slate-600 outline-none transition focus:border-teal-500 focus:ring-4 focus:ring-teal-500/20"
              />
            </div>

            {error && (
              <div className="rounded-lg border border-red-800 bg-red-950/50 px-3 py-2 text-sm text-red-300">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || token.trim().length === 0}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-teal-600 to-teal-700 py-2.5 text-sm font-semibold text-white shadow-lg shadow-teal-900/40 transition hover:to-teal-600 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitting ? 'Verifying…' : 'Verify & sign in'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link href="/login" className="text-xs text-slate-400 transition hover:text-slate-200">
              ← Back to sign in
            </Link>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-slate-500">
          © {new Date().getFullYear()} HAS ERP. All rights reserved.
        </p>
      </div>
    </div>
  );
}