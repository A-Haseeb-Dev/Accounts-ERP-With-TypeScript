// Client-side holder for the short-lived two-factor challenge token between
// the password step and the second-factor verification step. Kept in memory
// only, so a full page reload starts the login flow again.
let pendingMfaToken: string | null = null;
let pendingMfaUsername = '';

export function setPendingMfa(token: string, username: string) {
  pendingMfaToken = token;
  pendingMfaUsername = username;
}

export function getPendingMfa() {
  return { token: pendingMfaToken, username: pendingMfaUsername };
}

export function clearPendingMfa() {
  pendingMfaToken = null;
  pendingMfaUsername = '';
}