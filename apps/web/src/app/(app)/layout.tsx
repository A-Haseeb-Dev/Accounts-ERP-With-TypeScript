'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { Sidebar } from '@/components/sidebar';
import { PageLoader } from '@/components/ui/spinner';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-collapse the sidebar on narrower desktops/tablets so the main content
  // never gets cramped, while keeping it expanded on very wide screens.
  useEffect(() => {
    const mql = window.matchMedia('(min-width: 1280px)');
    const apply = () => setCollapsed(!mql.matches);
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <PageLoader />
      </div>
    );
  }

  return (
    <div className="flex min-h-screen">
      <Sidebar
        collapsed={collapsed}
        onToggle={() => setCollapsed((v) => !v)}
        mobileOpen={mobileOpen}
        onMobileToggle={setMobileOpen}
      />

      <div className="min-w-0 flex-1 flex flex-col">
        {/* Persistent top bar — gives a consistent, easy-to-find sidebar toggle:
            mobile opens the push drawer, desktop expands the collapsed rail. */}
        <header className="sticky top-0 z-40 flex h-14 shrink-0 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <button
            onClick={() => setMobileOpen(true)}
            className="rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="hidden rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 md:inline-flex"
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            <Menu className="h-5 w-5" />
          </button>
          <span className="text-sm font-bold text-slate-900">HAS ERP</span>
        </header>

        <main className="min-w-0 flex-1 px-4 pb-6 pt-6 sm:px-6 md:px-8">
          <div key={pathname} className="mx-auto max-w-7xl">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
