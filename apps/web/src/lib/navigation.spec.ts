import { describe, it, expect } from 'vitest';
import { NAV_ITEMS, flattenNav, permissionForPath } from './navigation';

describe('permissionForPath', () => {
  it('resolves the dashboard', () => {
    expect(permissionForPath('/')).toBe('dashboard.view');
  });

  it('resolves a nested admin page', () => {
    expect(permissionForPath('/parties/customers')).toBe('administration.customers.view');
  });

  it('ignores a trailing slash', () => {
    expect(permissionForPath('/accounts/payments/')).toBe('accounts.payments.view');
  });

  it('resolves a nested dynamic route against its parent page', () => {
    expect(permissionForPath('/hr/employees/123')).toBe('hr.employees.view');
  });

  it('returns undefined for a route that is not in the navigation', () => {
    expect(permissionForPath('/does-not-exist')).toBeUndefined();
  });

  it('gives the two system pages their own dedicated permissions', () => {
    expect(permissionForPath('/system/security')).toBe('system.security.manage');
    expect(permissionForPath('/system/print-layout')).toBe('system.print_layout.manage');
    expect(permissionForPath('/system/branding')).toBe('system.branding.manage');
    expect(permissionForPath('/system/settings')).toBe('system.settings.manage');
  });

  it('prefers the longest matching href', () => {
    // /administration/chart-of-accounts and /administration/head-accounts are
    // siblings, but /hr/employees and /hr/employees/[id] are not; make sure a
    // prefix match never wins over an exact one.
    expect(permissionForPath('/administration/head-accounts')).toBe('administration.head-accounts.view');
    expect(permissionForPath('/administration/sub-heads')).toBe('administration.sub-heads.view');
  });
});

describe('navigation permission coverage', () => {
  const leaves = flattenNav(NAV_ITEMS);

  it('gives every navigable page a permission', () => {
    const missing = leaves.filter((i) => !i.permission).map((i) => i.href);
    expect(missing).toEqual([]);
  });

  it('gives every page a route that resolves back to its permission', () => {
    const wrong = leaves
      .filter((i) => i.permission && permissionForPath(i.href) !== i.permission)
      .map((i) => `${i.href} -> ${permissionForPath(i.href)} (expected ${i.permission})`);
    expect(wrong).toEqual([]);
  });

  it('keeps Security and Print Layout off the generic settings permission', () => {
    const settings = permissionForPath('/system/settings');
    expect(permissionForPath('/system/security')).not.toBe(settings);
    expect(permissionForPath('/system/print-layout')).not.toBe(settings);
  });
});