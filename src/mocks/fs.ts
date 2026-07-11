export enum BaseDirectory { AppData = 1 }

export async function writeTextFile(_path: string, _contents: string): Promise<void> {}
export async function readTextFile(_path: string): Promise<string> {
  return '{}';
}

export async function exists(path: string, _options?: any): Promise<boolean> {
  return localStorage.getItem('mock_fs_' + path) !== null;
}

export async function writeFile(path: string, contents: Uint8Array, _options?: any): Promise<void> {
  // Base64 is more compact and avoids CSV parsing issues
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < contents.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, contents.subarray(i, i + chunkSize) as unknown as number[]);
  }
  localStorage.setItem('mock_fs_' + path, btoa(binary));
}

export async function readFile(path: string, _options?: any): Promise<Uint8Array> {
  const str = localStorage.getItem('mock_fs_' + path);
  if (!str) return new Uint8Array();
  try {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    // Fallback to legacy CSV format to maintain backward compatibility:
    const parts = str.split(',');
    const bytes = new Uint8Array(parts.length);
    for (let i = 0; i < parts.length; i++) {
      const n = Number(parts[i]);
      if (Number.isNaN(n)) {
        throw new Error(`Corrupted data (not base64 and invalid CSV) at index ${i} for path: ${path}. Error: ${err}`);
      }
      bytes[i] = n;
    }
    return bytes;
  }
}
