'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Building2,
  ChevronDown,
  Home,
  KeyRound,
  LogOut,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { filterNavigation, NAV_ITEMS } from '@/lib/navigation';
import { useFeatureFlags } from '@/hooks/use-feature-flags';
import { cn, initials } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input, Field } from '@/components/ui/field';
import { Modal } from '@/components/ui/modal';

export function Sidebar({
  mobileOpen,
  onMobileToggle,
}: {
  mobileOpen: boolean;
  onMobileToggle: (open: boolean) => void;
}) {
  const { user, logout, can } = useAuth();
  const { enabled } = useFeatureFlags();
  const pathname = usePathname();
  const isDeveloper = user?.roles?.includes('Developer') ?? false;

  const items = filterNavigation(NAV_ITEMS, {
    permissions: user?.permissions ?? [],
    enabledFeatures: enabled,
    isDeveloper,
  });
  const topLevel = items.filter((i) => i.children);

  const [pwOpen, setPwOpen] = useState(false);
  const close = () => onMobileToggle(false);

  return (
    <>
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/50 backdrop-blur-sm lg:hidden"
          onClick={close}
          aria-hidden="true"
        />
      )}

      <aside
        aria-label="Sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-64 max-w-[85vw] flex-col border-r border-slate-200 bg-white transition-transform duration-200',
          mobileOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
      >
        {/* Header */}
        <div className="flex h-16 items-center justify-between border-b border-slate-200 px-4">
          <Link href="/" onClick={close} className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <div className="leading-tight">
              <p className="text-sm font-bold text-slate-900">HAS ERP</p>
              <p className="text-[11px] text-slate-500">Management System</p>
            </div>
          </Link>

          <button
            onClick={close}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 lg:hidden"
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 overflow-y-auto px-3 py-4">
          {can('dashboard.view') && (
            <NavItem
              href="/"
              active={pathname === '/'}
              onNavigate={close}
              icon={<Home className="h-4 w-4 shrink-0" />}
            >
              Dashboard
            </NavItem>
          )}

          {topLevel.map((group) => (
            <NavGroup
              key={group.label}
              label={group.label}
              icon={group.icon}
              children={group.children ?? []}
              pathname={pathname}
              can={can}
              onNavigate={close}
            />
          ))}
        </nav>

        {/* Footer */}
        <div className="border-t border-slate-200 px-3 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
              {initials(user?.fullName)}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-slate-800">{user?.fullName}</p>
              <p className="truncate text-xs text-slate-400">@{user?.username}</p>
            </div>
            <button
              onClick={() => setPwOpen(true)}
              title="Change password"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <KeyRound className="h-4 w-4" />
            </button>
            <button
              onClick={() => logout()}
              title="Sign out"
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      <ChangePasswordModal open={pwOpen} onClose={() => setPwOpen(false)} />
    </>
  );
}

function ChangePasswordModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { changePassword } = useAuth();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    setError('');
    if (!current || !next) {
      setError('Please fill in both password fields.');
      return;
    }
    if (next.length < 8) {
      setError('New password must be at least 8 characters.');
      return;
    }
    if (next !== confirm) {
      setError('New password and confirmation do not match.');
      return;
    }
    setSaving(true);
    try {
      await changePassword(current, next);
      setCurrent('');
      setNext('');
      setConfirm('');
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not change password.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Change Password" size="sm">
      <div className="space-y-4">
        <p className="text-xs text-slate-500">
          After changing your password all other sessions are signed out. You will stay logged in here.
        </p>
        <Field label="Current password">
          <Input
            type="password"
            value={current}
            autoComplete="current-password"
            onChange={(e) => setCurrent(e.target.value)}
          />
        </Field>
        <Field label="New password">
          <Input
            type="password"
            value={next}
            autoComplete="new-password"
            onChange={(e) => setNext(e.target.value)}
          />
        </Field>
        <Field label="Confirm new password">
          <Input
            type="password"
            value={confirm}
            autoComplete="new-password"
            onChange={(e) => setConfirm(e.target.value)}
          />
        </Field>
        {error && <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
        <div className="flex justify-end gap-2 pt-1">
          <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={submit} loading={saving}>
            Update Password
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function NavItem({
  href,
  active,
  onNavigate,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  onNavigate: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onNavigate}
      className={cn(
        'mb-0.5 flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors',
        active
          ? 'bg-teal-50 text-teal-700'
          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
      )}
    >
      {icon}
      {children}
    </Link>
  );
}

function NavGroup({
  label,
  icon: Icon,
  children,
  pathname,
  can,
  onNavigate,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: { label: string; href: string; permission?: string }[];
  pathname: string;
  can: (p: string) => boolean;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(true);
  const visibleChildren = children.filter((c) => !c.permission || can(c.permission));
  const hasActive = visibleChildren.some((c) => pathname.startsWith(c.href));

  return (
    <div className="mb-1">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-colors',
          hasActive ? 'text-teal-700' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900',
        )}
      >
        <span className="flex items-center gap-3">
          <Icon className="h-4 w-4 shrink-0" />
          {label}
        </span>
        <ChevronDown className={cn('h-4 w-4 text-slate-400 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="mt-0.5 space-y-0.5 pb-1 pl-4">
          {visibleChildren.map((c) => (
            <Link
              key={c.href}
              href={c.href}
              onClick={onNavigate}
              className={cn(
                'block rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors',
                pathname.startsWith(c.href)
                  ? 'bg-teal-50 text-teal-700'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-900',
              )}
            >
              {c.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
