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

  // Detect legacy CSV format (comma-separated byte values)
  if (str.includes(',')) {
    const parts = str.split(',');
    const bytes = new Uint8Array(parts.length);
    for (let i = 0; i < parts.length; i++) {
      const n = Number(parts[i]);
      if (Number.isNaN(n) || n < 0 || n > 255) {
        throw new Error(`Corrupted CSV data at index ${i} for path: ${path}`);
      }
      bytes[i] = n;
    }
    return bytes;
  }

  try {
    const binary = atob(str);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    throw new Error(`Corrupted data for path: ${path}. Error: ${err}`);
  }
}
