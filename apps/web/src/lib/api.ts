// In development, point at the local NestJS server (set via apps/web/.env.local).
// In production (Vercel) the value is empty so requests stay same-origin and are
// proxied to the NestJS API by the Next.js rewrites in next.config.mjs.
export const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
    this.name = 'ApiError';
  }
}

interface ApiResponse<T> {
  success?: boolean;
  data?: T;
  message?: string;
  error?: { code?: string; message?: string; details?: unknown };
  statusCode?: number;
}

// In-memory token storage (survives SPA navigation, lost on full reload — user re-logs in).
let accessToken: string | null = null;
let refreshToken: string | null = null;

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  if (!refreshToken) return false;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      if (res.ok) {
        const body = (await res.json()) as ApiResponse<{ accessToken: string; refreshToken?: string }>;
        const data = body?.data;
        if (data?.accessToken) {
          accessToken = data.accessToken;
          if (data.refreshToken) refreshToken = data.refreshToken;
          return true;
        }
      }
      clearTokens();
      return false;
    } catch {
      return false;
    } finally {
      refreshing = null;
    }
  })();
  return refreshing;
}

export async function apiFetch<T>(
  path: string,
  options: RequestInit & { retryAuth?: boolean } = {},
): Promise<T> {
  const { retryAuth = true, ...init } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(init.headers as Record<string, string>),
  };

  if (accessToken && !headers['Authorization']) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  const res = await fetch(`${API_URL}/api${path}`, { ...init, headers });

  if (res.status === 401 && retryAuth) {
    const ok = await tryRefresh();
    if (ok) return apiFetch<T>(path, { ...init, retryAuth: false });
    const decoded = await parseError(res);
    throw new ApiError(res.status, decoded.message, decoded.code, decoded.details);
  }

  if (!res.ok) {
    const decoded = await parseError(res);
    throw new ApiError(res.status, decoded.message, decoded.code, decoded.details);
  }

  const ct = res.headers.get('content-type') || '';
  if (ct.includes('application/json')) {
    const body = (await res.json()) as ApiResponse<T>;
    if (body && typeof body === 'object' && 'success' in body) {
      return body.data as T;
    }
    return body as unknown as T;
  }
  return (await res.text()) as unknown as T;
}

async function parseError(res: Response): Promise<{ message: string; code?: string; details?: unknown }> {
  try {
    const body = (await res.json()) as ApiResponse<never>;
    return {
      message: body?.error?.message || body?.message || 'Request failed',
      code: body?.error?.code,
      details: body?.error?.details,
    };
  } catch {
    return { message: `Request failed (${res.status})` };
  }
}

export const qs = (params: Record<string, unknown>): string => {
  const search = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') search.set(k, String(v));
  }
  const s = search.toString();
  return s ? `?${s}` : '';
};
