export type TauriEvent = { payload?: unknown };

const listeners: Record<string, Array<(event: TauriEvent) => void>> = {};

export async function invoke(cmd: string, _args?: Record<string, unknown>): Promise<unknown> {
  if (typeof window !== 'undefined') {
    if (!window.__tauriInvokes) {
      window.__tauriInvokes = [];
    }
    window.__tauriInvokes.push(cmd);
  }
  return undefined;
}

export async function listen(event: string, handler: (event: TauriEvent) => void): Promise<() => void> {
  if (!listeners[event]) {
    listeners[event] = [];
  }
  listeners[event].push(handler);
  return () => {
    listeners[event] = listeners[event].filter(h => h !== handler);
  };
}

if (typeof window !== 'undefined') {
  window.__triggerTauriEvent = (event: string, payload?: unknown) => {
    const list = listeners[event];
    if (list) {
      for (const handler of list) {
        handler({ payload });
      }
    }
  };
}
