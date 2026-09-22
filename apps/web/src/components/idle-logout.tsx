'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Clock } from 'lucide-react';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/modal';

const IDLE_KEY = 'security.idleTimeoutMinutes';
const WARN_SECONDS = 60;
const ACTIVITY_EVENTS = ['mousedown', 'keydown', 'mousemove', 'wheel', 'touchstart'] as const;

export function IdleLogout() {
  const { logout } = useAuth();
  const { data } = useQuery<Record<string, string>>({
    queryKey: ['settings'],
    queryFn: () => apiFetch('/system/settings'),
    staleTime: 60_000,
  });

  const idleMs = (Number(data?.[IDLE_KEY]) || 0) * 60_000;

  const lastActivity = useRef(Date.now());
  const [warnAt, setWarnAt] = useState<number | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(WARN_SECONDS);

  useEffect(() => {
    if (idleMs <= 0) return;
    const bump = () => {
      lastActivity.current = Date.now();
      setWarnAt(null);
    };
    const opts = { passive: true } as AddEventListenerOptions;
    ACTIVITY_EVENTS.forEach((ev) => window.addEventListener(ev, bump, opts));
    window.addEventListener('focus', bump);

    const tick = window.setInterval(() => {
      const idle = Date.now() - lastActivity.current;
      if (idle >= idleMs) {
        setWarnAt((prev) => {
          if (prev === null) {
            setSecondsLeft(WARN_SECONDS);
            return Date.now();
          }
          const left = Math.max(0, WARN_SECONDS - Math.floor((Date.now() - prev) / 1000));
          setSecondsLeft(left);
          if (left <= 0) {
            window.clearInterval(tick);
            void logout();
          }
          return prev;
        });
      }
    }, 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((ev) => window.removeEventListener(ev, bump));
      window.removeEventListener('focus', bump);
      window.clearInterval(tick);
    };
  }, [idleMs, logout]);

  if (idleMs <= 0 || warnAt === null) return null;

  const stay = () => {
    lastActivity.current = Date.now();
    setWarnAt(null);
  };

  return (
    <Modal open onClose={stay} title="Session about to expire" size="sm">
      <div className="space-y-4">
        <p className="flex items-start gap-3 text-sm text-slate-600">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
          You have been inactive for a while. You will be signed out in{' '}
          <strong className="text-slate-900">{secondsLeft}s</strong> unless you keep working.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => void logout()}>
            Sign out now
          </Button>
          <Button type="button" onClick={stay}>
            Stay signed in
          </Button>
        </div>
      </div>
    </Modal>
  );
}