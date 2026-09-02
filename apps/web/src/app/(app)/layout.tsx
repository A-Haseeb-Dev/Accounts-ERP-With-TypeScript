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
      <main className="min-w-0 flex-1 px-4 pt-16 pb-6 sm:px-6 md:pt-6 md:pb-6 md:px-8">
        {/* Mobile hamburger to open the sidebar; it pushes main when open */}
        {!mobileOpen && (
          <button
            onClick={() => setMobileOpen(true)}
            className="fixed left-4 top-4 z-40 rounded-lg border border-slate-200 bg-white p-2 shadow-sm md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5 text-slate-700" />
          </button>
        )}
        <div key={pathname} className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}
