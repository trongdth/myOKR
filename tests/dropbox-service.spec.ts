import { test, expect } from '@playwright/test';
import {
  getDropboxAuthUrl,
  exchangeDropboxCode,
  parseAuthResponse,
} from '../src/lib/dropbox-oauth';

test.describe('Dropbox OAuth state (ticket 25)', () => {
  test('getDropboxAuthUrl includes a random state in the URL', async () => {
    const { url, codeVerifier, state } = await getDropboxAuthUrl('client-1');

    expect(state).toBeTruthy();
    expect(state).not.toBe(codeVerifier); // independent of the PKCE verifier
    expect(decodeURIComponent(url)).toContain(`state=${state}`);
  });

  test('exchangeDropboxCode rejects a state mismatch before any token request', async () => {
    // The mismatch check runs before the SDK call — a network attempt would
    // hang or fail this test.
    await expect(
      exchangeDropboxCode('c', 'code', 'verifier', {
        expectedState: 'expected',
        returnedState: 'attacker',
      }),
    ).rejects.toThrow(/state mismatch/i);
  });

  test('parseAuthResponse extracts code and state from a full redirect URL', () => {
    const parsed = parseAuthResponse(
      'https://example.com/callback?code=CODE&state=ST8',
    );
    expect(parsed).toEqual({ code: 'CODE', state: 'ST8' });
  });

  test('parseAuthResponse bare code has no state', () => {
    expect(parseAuthResponse('abc123')).toEqual({ code: 'abc123', state: null });
  });
});
