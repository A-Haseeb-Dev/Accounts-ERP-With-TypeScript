import { SetMetadata } from '@nestjs/common';

export const SYSTEM_ADMIN_KEY = 'systemAdmin';

/**
 * Restricts a route (or whole controller) to users holding the Developer or
 * Super Admin role. Grants the full set of permissions, guards the entire
 * `System` category (tags, branding, settings, users, roles, audit, etc.),
 * regardless of what permissions/features are assigned.
 */
export const SystemAdmin = () => SetMetadata(SYSTEM_ADMIN_KEY, true);