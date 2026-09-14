'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/field';
import { Card } from '@/components/ui/card';
import { PageHeader } from '@/components/page-header';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/context/auth-context';
import { ShieldCheck, ShieldOff, Download, CheckCircle2 } from 'lucide-react';

type Status = { enabled: boolean; secretConfigured: boolean; recoveryCodesRemaining: number };
type SetupResult = { secret: string; otpauthUrl: string; qrDataUrl: string; username: string; issuer: string };
type EnableResult = { recoveryCodes: string[] };

export default function SecurityPage() {
  const qc = useQueryClient();
  const { can } = useAuth();
  const canManage = can('system.settings.manage');

  const { data: status, isLoading } = useQuery<Status>({
    queryKey: ['two-factor', 'status'],
    queryFn: () => apiFetch('/auth/two-factor/status'),
    enabled: canManage,
  });

  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [setup, setSetup] = useState<SetupResult | null>(null);
  const [confirmCode, setConfirmCode] = useState('');
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [disableCode, setDisableCode] = useState('');
  const [disableOpen, setDisableOpen] = useState(false);
  const [pendingCode, setPendingCode] = useState(false);
  const [regenerateOpen, setRegenerateOpen] = useState(false);
  const [regenerateCode, setRegenerateCode] = useState('');

  const startSetup = useMutation({
    mutationFn: () => apiFetch<SetupResult>('/auth/two-factor/setup', {
      method: 'POST',
      body: JSON.stringify({ password }),
      retryAuth: false,
    }),
    onSuccess: (res) => {
      setError('');
      setSetup(res);
      setConfirmCode('');
    },
    onError: (e: Error) => setError(e.message),
  });

  const confirmEnable = useMutation({
    mutationFn: () => apiFetch<EnableResult>('/auth/two-factor/enable', {
      method: 'POST',
      body: JSON.stringify({ token: confirmCode.trim() }),
      retryAuth: false,
    }),
    onSuccess: (res) => {
      setError('');
      setRecoveryCodes(res.recoveryCodes);
      qc.invalidateQueries({ queryKey: ['two-factor', 'status'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const disable = useMutation({
    mutationFn: () => apiFetch('/auth/two-factor/disable', {
      method: 'POST',
      body: JSON.stringify({ token: disableCode.trim() }),
      retryAuth: false,
    }),
    onSuccess: () => {
      setError('');
      setDisableOpen(false);
      setDisableCode('');
      setSetup(null);
      qc.invalidateQueries({ queryKey: ['two-factor', 'status'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const regenerate = useMutation({
    mutationFn: () => apiFetch<EnableResult>('/auth/two-factor/regenerate-recovery-codes', {
      method: 'POST',
      body: JSON.stringify({ token: regenerateCode.trim() }),
      retryAuth: false,
    }),
    onSuccess: (res) => {
      setError('');
      setRegenerateOpen(false);
      setRegenerateCode('');
      setRecoveryCodes(res.recoveryCodes);
      qc.invalidateQueries({ queryKey: ['two-factor', 'status'] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const downloadCodes = () => {
    if (!recoveryCodes) return;
    const blob = new Blob([recoveryCodes.join('\n')], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'has-erp-recovery-codes.txt';
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  if (isLoading) return null;

  return (
    <div>
      <PageHeader title="Security" description="Two-factor authentication for your account." />
      <Card>
        <div className="max-w-2xl space-y-6 p-5">
          {status?.enabled ? (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-slate-800">Two-factor authentication</h3>
                    <Badge tone="green">Enabled</Badge>
                  </div>
                  <p className="mt-1 text-sm text-slate-500">
                    Every sign-in now asks for a verification code from your authenticator app. Recovery codes keep
                    working until a new set is generated.
                  </p>
                </div>
                <ShieldCheck className="h-8 w-8 shrink-0 text-teal-600" />
              </div>

              <div className="flex items-center gap-3">
                <Button variant="outline" onClick={() => setDisableOpen((v) => !v)}>
                  <ShieldOff className="h-4 w-4" /> Disable two-factor
                </Button>
                <Button variant="outline" onClick={() => setRegenerateOpen((v) => !v)}>
                  Regenerate recovery codes
                </Button>
              </div>

              <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
                <div className="text-sm text-slate-600">
                  Recovery codes remaining:{' '}
                  <span className="font-semibold text-slate-800">{status.recoveryCodesRemaining} / 10</span>
                </div>
                {status.recoveryCodesRemaining <= 3 && (
                  <span className="rounded-md bg-amber-100 px-2 py-1 text-xs font-medium text-amber-800">
                    {status.recoveryCodesRemaining === 0
                      ? 'Depleted — sign-in is only possible with your authenticator app'
                      : 'Getting low — generate a fresh set'}
                  </span>
                )}
              </div>

              {regenerateOpen && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="text-sm leading-relaxed text-slate-600">
                    This makes all current recovery codes stop working immediately. Enter an authenticator code to
                    confirm, then save the new ones.
                  </p>
                  <Field label="Authenticator code" hint="Enter a code from your authenticator app to confirm.">
                    <Input value={regenerateCode} onChange={(e) => setRegenerateCode(e.target.value)} placeholder="000000" inputMode="numeric" maxLength={6} />
                  </Field>
                  <Button
                    variant="danger"
                    loading={regenerate.isPending}
                    onClick={() => regenerate.mutate()}
                    disabled={regenerateCode.trim().length !== 6}
                  >
                    Generate new codes
                  </Button>
                </div>
              )}

              {disableOpen && (
                <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <Field label="Authenticator code" hint="Enter a code from your authenticator app to confirm.">
                    <Input value={disableCode} onChange={(e) => setDisableCode(e.target.value)} placeholder="000000" inputMode="numeric" maxLength={6} />
                  </Field>
                  <Button variant="danger" loading={disable.isPending} onClick={() => disable.mutate()} disabled={disableCode.trim().length !== 6}>
                    Confirm disable
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h3 className="font-semibold text-slate-800">Two-factor authentication</h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Add an extra layer of protection. After enabling, sign-in also asks for a 6-digit code from Google
                    Authenticator or any other TOTP app.
                  </p>
                </div>
                <ShieldOff className="h-8 w-8 shrink-0 text-slate-300" />
              </div>

              {!setup ? (
                <div className="space-y-3">
                  <Field label="Confirm your password" hint="Your password is required to start the setup.">
                    <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Current password" />
                  </Field>
                  <Button loading={startSetup.isPending} onClick={() => startSetup.mutate()} disabled={!password}>
                    Start setup
                  </Button>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="flex items-start gap-4 rounded-lg border border-teal-200 bg-teal-50 p-4">
                    <img src={setup.qrDataUrl} alt="QR code" className="h-40 w-40 shrink-0 rounded-lg border border-teal-200 bg-white p-1" />
                    <div className="space-y-1 text-sm text-teal-900">
                      <p className="font-semibold">Scan this QR code with your authenticator app</p>
                      <p>In Google Authenticator, tap the + button and scan it. The app will start generating 6-digit codes.</p>
                      <p className="break-all font-mono text-xs text-teal-700">Manual entry: <span className="font-semibold">{setup.secret}</span></p>
                      <p className="text-xs">Account: <span className="font-semibold">{setup.username} @ {setup.issuer ?? 'HasERP'}</span></p>
                    </div>
                  </div>

                  <div className="space-y-3">
                    <Field label="Enter the 6-digit code" hint="Type the code your app is showing to confirm setup.">
                      <Input value={confirmCode} onChange={(e) => setConfirmCode(e.target.value)} placeholder="000000" inputMode="numeric" maxLength={6} className="font-mono" />
                    </Field>
                    <Button loading={confirmEnable.isPending} onClick={() => confirmEnable.mutate()} disabled={confirmCode.trim().length !== 6}>
                      <CheckCircle2 className="h-4 w-4" /> Enable two-factor
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          {recoveryCodes && (
            <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h4 className="font-semibold text-amber-900">Save your recovery codes</h4>
                  <p className="text-sm text-amber-800">
                    Each code works once and lets you sign in if you lose your authenticator app. Store them somewhere safe.
                  </p>
                </div>
                <Button variant="outline" size="sm" onClick={downloadCodes}>
                  <Download className="h-4 w-4" /> Download
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {recoveryCodes.map((code) => (
                  <code key={code} className="rounded-md bg-white px-3 py-2 text-center font-mono text-xs font-semibold text-amber-900 shadow-sm">
                    {code}
                  </code>
                ))}
              </div>
              <Button variant="outline" onClick={() => setRecoveryCodes(null)}>
                I've saved my codes
              </Button>
            </div>
          )}

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</div>
          )}
        </div>
      </Card>
    </div>
  );
}