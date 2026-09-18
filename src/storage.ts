/**
 * Token persistence.
 *
 * The spec makes this app single-user by design: there is no backend and no
 * OAuth flow, so the personal access token lives in this browser's
 * localStorage and is sent nowhere except lichess.org. Any 401 clears it and
 * drops the user back to the token screen.
 */

const TOKEN_KEY = 'flipchess.token';
const RATED_KEY = 'flipchess.rated';

/** localStorage throws in some privacy modes; never let that break the app. */
function safeGet(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* storage unavailable — the session just won't persist */
  }
}

function safeRemove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function loadToken(): string | null {
  const token = safeGet(TOKEN_KEY);
  return token && token.trim() ? token.trim() : null;
}

export function saveToken(token: string): void {
  safeSet(TOKEN_KEY, token.trim());
}

export function clearToken(): void {
  safeRemove(TOKEN_KEY);
}

export function loadRated(): boolean {
  return safeGet(RATED_KEY) === 'true';
}

export function saveRated(rated: boolean): void {
  safeSet(RATED_KEY, String(rated));
}
