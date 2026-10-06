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
// In-memory token cache. The httpOnly cookies the API sets are the source of
// truth - they survive a reload and are unreachable from JS. These only spare a
// cookie round-trip on the happy path, so losing them on reload is harmless.
let accessToken: string | null = null;
let refreshToken: string | null = null;

const TOKEN_CHANNEL = 'has-erp-tokens';
type TokenMessage = { type: 'tokens'; accessToken: string; refreshToken?: string };

/**
 * Shares freshly issued tokens with the other tabs of this app.
 *
 * The API rotates the refresh token on every use, so two open tabs holding
 * different copies would race: tab A refreshes and invalidates the token tab B
 * still has, and tab B's next refresh fails and logs it out. Broadcasting the
 * new pair keeps every tab on the same generation. Receiving a message does not
 * re-broadcast, so this cannot loop.
 */
let tokenChannel: BroadcastChannel | null = null;

function tokenBus(): BroadcastChannel | null {
  if (typeof BroadcastChannel === 'undefined') return null;
  if (!tokenChannel) {
    tokenChannel = new BroadcastChannel(TOKEN_CHANNEL);
    tokenChannel.onmessage = (event: MessageEvent) => {
      const data = event.data as TokenMessage | null;
      if (!data || data.type !== 'tokens' || !data.accessToken) return;
      accessToken = data.accessToken;
      if (data.refreshToken) refreshToken = data.refreshToken;
    };
  }
  return tokenChannel;
}

function publishTokens(access: string, refresh?: string) {
  try {
    tokenBus()?.postMessage({ type: 'tokens', accessToken: access, refreshToken: refresh });
  } catch {
    // A closed channel must never break authentication.
  }
}

export function setTokens(access: string, refresh: string) {
  accessToken = access;
  refreshToken = refresh;
  publishTokens(access, refresh);
}

export function clearTokens() {
  accessToken = null;
  refreshToken = null;
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function getRefreshToken(): string | null {
  return refreshToken;
}

let refreshing: Promise<boolean> | null = null;

/**
 * Sent on every request, including refresh. The browser drops httpOnly cookies
 * on a cross-origin call unless credentials are included, and every call in
 * development is cross-origin (the API runs on a different port). Without it
 * the auth cookies the API sets were silently discarded, so a page reload lost
 * the session even though the 7-day refresh cookie was still sitting there.
 */
const CREDENTIALS: RequestCredentials = 'include';

async function tryRefresh(): Promise<boolean> {
  if (refreshing) return refreshing;
  // No in-memory token is not a reason to give up: the httpOnly refresh cookie
  // is the real source of truth and is what actually authenticates this call.
  refreshing = (async () => {
    try {
      const res = await fetch(`${API_URL}/api/auth/refresh`, {
        method: 'POST',
        credentials: CREDENTIALS,
        headers: { 'Content-Type': 'application/json' },
        // Fallback for a cold start where only the cookie is available; the
        // server prefers the cookie when both are present.
        ...(refreshToken ? { body: JSON.stringify({ refreshToken }) } : {}),
      });
      if (res.ok) {
        const body = (await res.json()) as ApiResponse<{ accessToken: string; refreshToken?: string }>;
        const data = body?.data;
        if (data?.accessToken) {
          accessToken = data.accessToken;
          if (data.refreshToken) refreshToken = data.refreshToken;
          publishTokens(data.accessToken, data.refreshToken);
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

  const res = await fetch(`${API_URL}/api${path}`, {
    ...init,
    headers,
    credentials: init.credentials ?? CREDENTIALS,
  });

  if (res.status === 401 && retryAuth) {
    // Retry the refresh at most once per burst: a failed refresh clears the
    // tokens, so without this a page that fires several requests at once would
    // keep hammering an endpoint whose credentials are known to be dead.
    const ok = await tryRefresh();
    if (ok) return apiFetch<T>(path, { ...init, retryAuth: false });
    clearTokens();
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
