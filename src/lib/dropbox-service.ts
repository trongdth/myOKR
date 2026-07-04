import { Dropbox, DropboxAuth } from 'dropbox';
import { getAutomergeBinary, mergeExternalBinary } from './automerge-storage';

const DROPBOX_FILE_PATH = '/myokr-data.automerge';

/**
 * Generates the PKCE OAuth 2.0 authorization URL.
 */
export async function getDropboxAuthUrl(clientId: string): Promise<{ url: string; codeVerifier: string }> {
  const auth = new DropboxAuth({ clientId });
  // Pass undefined for redirectUri to use the "no-redirect" copy/paste code flow
  // Use 'offline' to get a refresh token
  const url = await auth.getAuthenticationUrl(undefined as any, undefined, 'code', 'offline', undefined, 'none', true);
  const codeVerifier = auth.getCodeVerifier();
  return { url: url as string, codeVerifier };
}

/**
 * Exchanges the authorization code for a refresh token.
 */
export async function exchangeDropboxCode(clientId: string, code: string, codeVerifier: string): Promise<string> {
  const auth = new DropboxAuth({ clientId });
  auth.setCodeVerifier(codeVerifier);
  const response = await auth.getAccessTokenFromCode(undefined as any, code);
  return (response.result as any).refresh_token;
}

/**
 * Validates a Dropbox connection by calling the users/get_current_account API.
 */
export async function validateDropboxToken(clientId: string, refreshToken: string): Promise<boolean> {
  try {
    const dbx = new Dropbox({ clientId, refreshToken });
    await dbx.usersGetCurrentAccount();
    return true;
  } catch (error) {
    console.error('Dropbox validation failed', error);
    return false;
  }
}

/**
 * Downloads the automerge file from Dropbox.
 * Returns null if the file does not exist.
 */
export async function downloadFromDropbox(clientId: string, refreshToken: string): Promise<Uint8Array | null> {
  try {
    const dbx = new Dropbox({ clientId, refreshToken });
    const response = await dbx.filesDownload({ path: DROPBOX_FILE_PATH });
    
    // Dropbox API returns fileBlob in the response for browser environments
    const fileBlob = (response.result as any).fileBlob;
    if (fileBlob) {
      // Cap the remote blob size before materializing it: a pathological/huge doc
      // would otherwise be loaded+merged synchronously on the UI thread (Automerge
      // WASM), freezing or OOM-crashing the webview on every 5-min auto-sync.
      const MAX_SYNC_BYTES = 50 * 1024 * 1024; // 50 MB — well above any realistic OKR dataset
      if (fileBlob.size > MAX_SYNC_BYTES) {
        throw new Error(`Sync aborted: remote document (${fileBlob.size} bytes) exceeds the ${MAX_SYNC_BYTES} byte cap`);
      }
      const arrayBuffer = await fileBlob.arrayBuffer();
      return new Uint8Array(arrayBuffer);
    }
    return null;
  } catch (error: any) {
    // If the file is simply not found, return null
    if (error?.error?.error_summary?.includes('path/not_found')) {
      return null;
    }
    throw error;
  }
}

/**
 * Uploads the automerge binary file to Dropbox.
 */
export async function uploadToDropbox(clientId: string, refreshToken: string, binary: Uint8Array): Promise<void> {
  try {
    const dbx = new Dropbox({ clientId, refreshToken });
    await dbx.filesUpload({
      path: DROPBOX_FILE_PATH,
      contents: binary,
      mode: { '.tag': 'overwrite' },
    });
  } catch (error) {
    console.error('Dropbox upload failed', error);
    throw error;
  }
}

/**
 * Performs a full synchronization with Dropbox:
 * 1. Downloads the remote file
 * 2. Merges it with the local document
 * 3. Uploads the merged result
 * Returns true if successful and a merge happened, false if token invalid or no remote file.
 */
export async function syncWithDropbox(clientId: string, refreshToken: string): Promise<boolean> {
  if (!clientId || !refreshToken) return false;
  try {
    const remoteBinary = await downloadFromDropbox(clientId, refreshToken);
    let finalBinary: Uint8Array;
    
    if (remoteBinary) {
      finalBinary = await mergeExternalBinary(remoteBinary);
    } else {
      finalBinary = await getAutomergeBinary();
    }
    
    await uploadToDropbox(clientId, refreshToken, finalBinary);
    return true;
  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
}
