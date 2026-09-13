export interface JwtPayload {
  id: string;
  username: string;
  fullName: string;
  organizationId: string;
}

export interface MfaChallengePayload {
  id: string;
  purpose: 'mfa';
}

export interface JwtRefreshPayload {
  id: string;
  tokenVersion: number;
}