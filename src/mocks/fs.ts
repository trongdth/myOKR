export enum BaseDirectory { AppData = 1 }

export async function writeTextFile(_path: string, _contents: string): Promise<void> {}
export async function readTextFile(_path: string): Promise<string> {
  return '{}';
}

const binaryStore = new Map<string, Uint8Array>();

export async function exists(path: string, _options?: any): Promise<boolean> {
  return binaryStore.has(path);
}

export async function writeFile(path: string, contents: Uint8Array, _options?: any): Promise<void> {
  binaryStore.set(path, contents);
}

export async function readFile(path: string, _options?: any): Promise<Uint8Array> {
  return binaryStore.get(path) || new Uint8Array();
}
