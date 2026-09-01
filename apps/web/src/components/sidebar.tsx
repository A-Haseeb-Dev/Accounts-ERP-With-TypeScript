'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import { Building2, ChevronDown, Home, LogOut, Menu, X } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { filterByPermissions, NAV_ITEMS } from '@/lib/navigation';
import { cn, initials } from '@/lib/utils';

export function Sidebar() {
  const { user, logout, can } = useAuth();
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  const items = filterByPermissions(NAV_ITEMS, user?.permissions ?? []);
  const topLevel = items.filter((i) => i.children);

  const isActive = (href: string) => pathname === href || pathname.startsWith(href);

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        className="fixed left-4 top-4 z-40 rounded-lg border border-slate-200 bg-white p-2 shadow-sm lg:hidden"
        aria-label="Open menu"
      >
        <Menu className="h-5 w-5 text-slate-700" />
      </button>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-slate-900/50 lg:hidden" onClick={() => setMobileOpen(false)} />
      )}

      <aside
        className={cn(
          'fixed inset-y-0 left-0 z-50 flex w-72 flex-col bg-slate-900 transition-transform lg:static lg:translate-x-0',
          mobileOpen ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-teal-600 text-white">
              <Building2 className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-white">HAS ERP</p>
              <p className="text-[11px] text-slate-500">Management System</p>
            </div>
          </div>
          <button onClick={() => setMobileOpen(false)} className="text-slate-500 lg:hidden">
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-3 py-4">
          <Link
            href="/"
            onClick={() => setMobileOpen(false)}
            className={cn(
              'mb-1 flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-slate-400 hover:bg-slate-800 hover:text-white',
              pathname === '/' && 'bg-slate-800 text-white',
            )}
          >
            <Home className="h-4 w-4" />
            Dashboard
          </Link>

          {topLevel.map((group) => (
            <NavGroup
              key={group.label}
              label={group.label}
              icon={group.icon}
              children={group.children ?? []}
              pathname={pathname}
              can={can}
              onNavigate={() => setMobileOpen(false)}
            />
          ))}
        </nav>

        <div className="border-t border-slate-800 p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-600 text-xs font-bold text-white">
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
  const anyActive = children.some((c) => pathname.startsWith(c.href));

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