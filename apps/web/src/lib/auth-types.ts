export interface SessionUser {
  id: string;
  fullName: string;
  username: string;
  email?: string | null;
  phone?: string | null;
  roles: string[];
  permissions: string[];
}

export const isAllowed = (permissions: string[] | undefined, permission: string): boolean => {
  if (!permissions || permissions.includes('*')) return true;
  return permissions.includes(permission);
};