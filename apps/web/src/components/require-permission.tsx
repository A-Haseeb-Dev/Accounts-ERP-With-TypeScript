'use client';

import Link from 'next/link';
import { ShieldAlert } from 'lucide-react';
import { useAuth } from '@/context/auth-context';

interface RequirePermissionProps {
  /** Permission the user must hold. A Developer passes automatically. */
  permission: string;
  children: React.ReactNode;
  /** Optional label for the screen, used in the refusal message. */
  label?: string;
}

/**
 * Page-level permission gate.
 *
 * The sidebar already hides a link the user has no permission for, but that is
 * only navigation: anyone can still type the URL. Every screen that a sidebar
 * entry locks down should wrap its body in this so the page itself refuses
 * too, instead of rendering a form that will only fail on save.
 *
 * The API guards its own endpoints with `@Permissions()`, so this is defence in
 * depth and a better error message — not the only thing standing between a
 * user and the data.
 */
export function RequirePermission({ permission, children, label }: RequirePermissionProps) {
  const { can, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (!can(permission)) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 px-4 text-center">
        <ShieldAlert className="h-10 w-10 text-muted-foreground" aria-hidden />
        <div>
          <p className="font-medium">You do not have access to {label ?? 'this page'}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Your account is missing the <code className="rounded bg-muted px-1 py-0.5 text-xs">{permission}</code>{' '}
            permission. Ask an administrator to grant it.
          </p>
        </div>
        <Link href="/" className="text-sm text-primary underline underline-offset-4 hover:opacity-80">
          Back to dashboard
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}