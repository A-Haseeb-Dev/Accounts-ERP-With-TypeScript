export interface JwtPayload {
  id: string;
  username: string;
  fullName: string;
  organizationId: string;
}

export interface JwtRefreshPayload {
  id: string;
  tokenVersion: number;
}