'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import {
  Building2,
  ChevronDown,
  Home,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  X,
} from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { filterByPermissions, NAV_ITEMS } from '@/lib/navigation';
import { cn, initials } from '@/lib/utils';

export function Sidebar({
  collapsed,
  onToggle,
  mobileOpen,
  onMobileToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileToggle: (open: boolean) => void;
}) {
  const { user, logout, can } = useAuth();
  const pathname = usePathname();

  const items = filterByPermissions(NAV_ITEMS, user?.permissions ?? []);
  const topLevel = items.filter((i) => i.children);

  // `rail` is true when the sidebar is a narrow icon-only column: desktop
  // collapsed, OR mobile closed (width 0). `expanded` controls whether the
  // full labels are shown.
  const rail = collapsed && !mobileOpen;
  const full = mobileOpen || !rail;

  // Mobile open/close state drives a width of w-72 / w-0; desktop uses
  // `collapsed` for a w-16 icon rail / w-72 full. Because the aside is a
  // flex sibling, main automatically resizes when this width changes.
  return (
    <>
      <aside
        aria-label="Sidebar"
        className={cn(
          'relative z-30 flex shrink-0 flex-col bg-slate-900 transition-all duration-200 overflow-hidden',
          mobileOpen && 'w-72',
          !mobileOpen && 'w-0 md:w-72',
          rail && 'md:w-16',
        )}
      >
        {/* Header */}
        <div className={cn('flex items-center justify-between border-b border-slate-800 px-4 py-4', rail ? 'md:px-2' : 'md:px-3')}>
          <Link href="/" onClick={() => onMobileToggle(false)} className="flex items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-teal-600 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            {full && (
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-white">HAS ERP</p>
                <p className="truncate text-[11px] text-slate-500">Management System</p>
              </div>
            )}
          </Link>

          <div className="flex items-center gap-1">
            {/* Mobile close — sits top-right of the sidebar */}
            <button
              onClick={() => onMobileToggle(false)}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:hidden"
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>

            {/* Desktop/tablet collapse toggle */}
            <button
              onClick={onToggle}
              className="hidden rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white md:block"
              aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            >
              {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            </button>
          </div>
        </div>

        {/* Nav */}
        <nav className={cn('flex-1 overflow-y-auto py-4', rail ? 'px-2' : 'px-3')}>
          <Link
            href="/"
            onClick={() => onMobileToggle(false)}
            className={cn(
              'mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white',
              pathname === '/' && 'bg-slate-800 text-white',
              rail && 'md:justify-center md:px-0',
            )}
            title={rail ? 'Dashboard' : undefined}
          >
            <Home className="h-4 w-4 shrink-0" />
            {full && <span>Dashboard</span>}
          </Link>

          {topLevel.map((group) => (
            <NavGroup
              key={group.label}
              label={group.label}
              icon={group.icon}
              children={group.children ?? []}
              pathname={pathname}
              can={can}
              collapsed={rail}
              onNavigate={() => onMobileToggle(false)}
            />
          ))}
        </nav>

        {/* User footer */}
        <div className={cn('border-t border-slate-800 p-4', rail ? 'md:px-2' : 'md:px-3')}>
          {rail ? (
            <div className="flex justify-center">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white" title={user?.fullName}>
                {initials(user?.fullName)}
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
                {initials(user?.fullName)}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-white">{user?.fullName}</p>
                <p className="truncate text-[11px] text-slate-500">@{user?.username}</p>
              </div>
              <button onClick={() => logout()} title="Sign out" className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white">
                <LogOut className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function NavGroup({
  label,
  icon: Icon,
  children,
  pathname,
  can,
  collapsed,
  onNavigate,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  children: { label: string; href: string; permission?: string }[];
  pathname: string;
  can: (p: string) => boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const [open, setOpen] = useState(true);
  const anyActive = children.some((c) => pathname.startsWith(c.href));

  if (collapsed) {
    const first = children.find((c) => !c.permission || can(c.permission));
    if (!first) return null;
    return (
      <Link
        href={first.href}
        onClick={onNavigate}
        className={cn(
          'mb-1 flex items-center justify-center gap-3 rounded-lg px-3 py-2 text-slate-400 hover:bg-slate-800 hover:text-white',
          pathname.startsWith(first.href) && 'bg-slate-800 text-teal-400',
        )}
        title={first.label}
      >
        <Icon className="h-4 w-4 shrink-0" />
      </Link>
    );
  }

  return (
    <div className="mb-0.5">
      <button
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white',
          anyActive && 'text-white',
        )}
      >
        <span className="flex items-center gap-3">
          <Icon className="h-4 w-4" />
          {label}
        </span>
        <ChevronDown className={cn('h-4 w-4 transition-transform', open && 'rotate-180')} />
      </button>
      {open && (
        <div className="ml-4 mt-0.5 space-y-0.5 border-l border-slate-800 pl-3">
          {children
            .filter((c) => !c.permission || can(c.permission))
            .map((c) => (
              <Link
                key={c.href}
                href={c.href}
                onClick={onNavigate}
                className={cn(
                  'block rounded-lg px-3 py-1.5 text-[13px] text-slate-500 hover:bg-slate-800 hover:text-white',
                  pathname.startsWith(c.href) && 'bg-slate-800 text-teal-400',
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
