export enum BaseDirectory { AppData = 1 }

export async function writeTextFile(_path: string, _contents: string): Promise<void> {}
export async function readTextFile(_path: string): Promise<string> {
  return '{}';
}

export async function exists(path: string, _options?: any): Promise<boolean> {
  return localStorage.getItem('mock_fs_' + path) !== null;
}

export async function writeFile(path: string, contents: Uint8Array, _options?: any): Promise<void> {
  localStorage.setItem('mock_fs_' + path, Array.from(contents).join(','));
}

export async function readFile(path: string, _options?: any): Promise<Uint8Array> {
  const str = localStorage.getItem('mock_fs_' + path);
  if (!str) return new Uint8Array();
  return new Uint8Array(str.split(',').map(Number));
}
