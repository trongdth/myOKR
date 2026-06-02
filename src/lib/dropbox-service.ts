import { Dropbox } from 'dropbox';
import { getAutomergeBinary, mergeExternalBinary } from './automerge-storage';

const DROPBOX_FILE_PATH = '/myokr-data.automerge';

/**
 * Validates a Dropbox access token by calling the users/get_current_account API.
 */
export async function validateDropboxToken(token: string): Promise<boolean> {
  try {
    const dbx = new Dropbox({ accessToken: token });
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
export async function downloadFromDropbox(token: string): Promise<Uint8Array | null> {
  try {
    const dbx = new Dropbox({ accessToken: token });
    const response = await dbx.filesDownload({ path: DROPBOX_FILE_PATH });
    
    // Dropbox API returns fileBlob in the response for browser environments
    const fileBlob = (response.result as any).fileBlob;
    if (fileBlob) {
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
export async function uploadToDropbox(token: string, binary: Uint8Array): Promise<void> {
  try {
    const dbx = new Dropbox({ accessToken: token });
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
export async function syncWithDropbox(token: string): Promise<boolean> {
  if (!token) return false;
  try {
    const remoteBinary = await downloadFromDropbox(token);
    let finalBinary: Uint8Array;
    
    if (remoteBinary) {
      finalBinary = await mergeExternalBinary(remoteBinary);
    } else {
      finalBinary = await getAutomergeBinary();
    }
    
    await uploadToDropbox(token, finalBinary);
    return true;
  } catch (error) {
    console.error('Sync failed:', error);
    throw error;
  }
}
