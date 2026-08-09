import { DropboxAuth } from 'dropbox';

/**
 * Generates the PKCE OAuth 2.0 authorization URL plus a CSRF [state] token
 * (ticket 25). The state must be verified against the value returned with
 * the authorization code.
 */
export async function getDropboxAuthUrl(clientId: string): Promise<{
  url: string;
  codeVerifier: string;
  state: string;
}> {
  const auth = new DropboxAuth({ clientId });
  const state = crypto.randomUUID().replace(/-/g, '');
  // Pass undefined for redirectUri to use the "no-redirect" copy/paste code flow
  // Use 'offline' to get a refresh token
  const url = await auth.getAuthenticationUrl(
    undefined as any,
    state,
    'code',
    'offline',
    undefined,
    'none',
    true,
  );
  const codeVerifier = auth.getCodeVerifier();
  return { url: url as string, codeVerifier, state };
}

/**
 * Parses what the user pastes back after authorizing: the bare code, a
 * `code=...&state=...` query string, or the full redirect URL.
 */
export function parseAuthResponse(raw: string): { code: string; state: string | null } {
  const text = raw.trim();
  if (text.startsWith('http')) {
    const params = new URL(text).searchParams;
    return { code: params.get('code') ?? '', state: params.get('state') };
  }
  if (text.includes('=')) {
    const params = new URLSearchParams(text.startsWith('?') ? text.slice(1) : text);
    return { code: params.get('code') ?? '', state: params.get('state') };
  }
  return { code: text, state: null };
}

/**
 * Exchanges the authorization code for a refresh token. Rejects the
 * exchange — before any network I/O — when the returned state does not
 * match the expected state from [getDropboxAuthUrl] (CSRF protection).
 */
export async function exchangeDropboxCode(
  clientId: string,
  code: string,
  codeVerifier: string,
  { expectedState, returnedState }: { expectedState: string; returnedState: string },
): Promise<string> {
  if (returnedState !== expectedState) {
    throw new Error('OAuth state mismatch — authorization rejected');
  }
  const auth = new DropboxAuth({ clientId });
  auth.setCodeVerifier(codeVerifier);
  const response = await auth.getAccessTokenFromCode(undefined as any, code);
  return (response.result as any).refresh_token;
}
