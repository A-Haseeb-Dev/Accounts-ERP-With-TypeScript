export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

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

let refreshing: Promise<boolean> | null = null;

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
      });
      return res.ok;
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

  const res = await fetch(`${API_URL}/api${path}`, { ...init, headers, credentials: 'include' });

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