import { PERMISSION_CATALOG } from '../permissions/permission-catalog';

export interface FeatureDef {
  /** Feature code. Each feature maps to exactly one permission (same name). */
  code: string;
  /** Human readable resource, e.g. "Main Accounts". */
  resource: string;
  /** Human readable action, e.g. "View". */
  action: string;
  /** Grouping used by the Company Features screen, e.g. "Chart of Accounts". */
  group: string;
  /** Combined label, e.g. "Main Accounts — View". */
  label: string;
  description: string;
  permissions: string[];
}

const GROUP_ORDER = [
  'Dashboard',
  'Chart of Accounts',
  'Items & Stock',
  'Parties',
  'Sales',
  'Inventory',
  'Accounting',
  'Reports',
  'Users & Access',
  'System',
];

function groupFor(name: string): string {
  if (name.startsWith('dashboard')) return 'Dashboard';
  if (
    name.startsWith('administration.customers') ||
    name.startsWith('administration.suppliers') ||
    name.startsWith('administration.towns')
  ) {
    return 'Parties';
  }
  if (
    name.startsWith('administration.head-accounts') ||
    name.startsWith('administration.sub-heads') ||
    name.startsWith('administration.main-accounts')
  ) {
    return 'Chart of Accounts';
  }
  if (name.startsWith('administration.')) return 'Items & Stock';
  if (name.startsWith('inventory.')) return 'Inventory';
  if (name.startsWith('sales.')) return 'Sales';
  if (name.startsWith('accounts.')) return 'Accounting';
  if (name.startsWith('reports.')) return 'Reports';
  if (
    name.startsWith('users.') ||
    name.startsWith('roles.') ||
    name.startsWith('permissions.')
  ) {
    return 'Users & Access';
  }
  if (name.startsWith('system.')) return 'System';
  return 'Other';
}

function titleCase(value: string): string {
  return value.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function resourceFor(name: string): string {
  const parts = name.split('.');
  const resource = parts.length > 1 ? parts.slice(0, -1).join('.') : name;
  const segs = resource.split('.');
  const label = segs.length > 1 ? segs.slice(1).join(' ') : segs[0];
  return titleCase(label);
}

/**
 * Company features are derived from the permission catalog so that *every*
 * action (view / create / update / delete / post / print ...) in the system can
 * be switched on or off for a company. A feature code is identical to its
 * permission name; turning a feature off blocks the guarded endpoints that
 * require that permission for every user except the Developer role.
 */
export const FEATURES: FeatureDef[] = PERMISSION_CATALOG.map((permission) => {
  const resource = resourceFor(permission.name);
  const action = titleCase(permission.action);
  const group = groupFor(permission.name);
  return {
    code: permission.name,
    resource,
    action,
    group,
    label: `${resource} — ${action}`,
    description: permission.description ?? `${action} ${resource}`,
    permissions: [permission.name],
  };
}).sort((a, b) => {
  const ga = GROUP_ORDER.indexOf(a.group);
  const gb = GROUP_ORDER.indexOf(b.group);
  if (ga !== gb) return ga - gb;
  if (a.resource !== b.resource) return a.resource.localeCompare(b.resource);
  return a.action.localeCompare(b.action);
});

const FEATURE_CODES = new Set(FEATURES.map((f) => f.code));

/** Returns the feature code that owns the given permission, if any. */
export function featureForPermission(permission: string): string | undefined {
  return FEATURE_CODES.has(permission) ? permission : undefined;
}

/** Whether a code is a known feature. Unknown codes are treated as enabled. */
export function isKnownFeature(code: string): boolean {
  return FEATURE_CODES.has(code);
}
