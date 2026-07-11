const listeners: Record<string, Array<(event: any) => void>> = {};

export async function invoke(cmd: string, _args?: Record<string, unknown>): Promise<unknown> {
  if (typeof window !== 'undefined') {
    if (!(window as any).__tauriInvokes) {
      (window as any).__tauriInvokes = [];
    }
    (window as any).__tauriInvokes.push(cmd);
  }
  return undefined;
}

export async function listen(event: string, handler: (event: any) => void): Promise<() => void> {
  if (!listeners[event]) {
    listeners[event] = [];
  }
  listeners[event].push(handler);
  return () => {
    listeners[event] = listeners[event].filter(h => h !== handler);
  };
}

if (typeof window !== 'undefined') {
  (window as any).__triggerTauriEvent = (event: string, payload?: any) => {
    const list = listeners[event];
    if (list) {
      for (const handler of list) {
        handler({ payload });
      }
    }
  };
}
