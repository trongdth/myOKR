export type TauriEvent = { payload?: unknown };

const listeners: Record<string, Array<(event: TauriEvent) => void>> = {};

// Test-configured `get_timer_state` return: `[remaining_secs, is_running,
// session_type]`. Null → the command reports nothing (frontend treats the
// response as absent, as before).
let mockTimerState: [number, boolean, string] | null = null;

// One-shot delay for the next `get_timer_state` response (fake-clock-driven
// setTimeout): lets a test issue a poll, change the world (complete the
// session, start a new one), and only then deliver the now-stale response —
// the suspended-webview race where a response resolves after the JS thread
// was blocked (e.g. by an Automerge write) past a session transition.
let mockTimerStateDelayMs: number | null = null;

export async function invoke(cmd: string, _args?: Record<string, unknown>): Promise<unknown> {
  if (typeof window !== 'undefined') {
    if (!window.__tauriInvokes) {
      window.__tauriInvokes = [];
    }
    window.__tauriInvokes.push(cmd);
  }
  if (cmd === 'get_timer_state') {
    if (mockTimerStateDelayMs === null) return mockTimerState ?? undefined;
    const state = mockTimerState;
    const delay = mockTimerStateDelayMs;
    mockTimerStateDelayMs = null;
    return new Promise(resolve => { setTimeout(() => resolve(state ?? undefined), delay); });
  }
  return undefined;
}

export async function listen(event: string, handler: (event: TauriEvent) => void): Promise<() => void> {
  if (!listeners[event]) {
    listeners[event] = [];
  }
  if (!listeners[event].includes(handler)) {
    listeners[event].push(handler);
  }
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
  window.__getActiveListenerCount = (event: string) => {
    return listeners[event] ? listeners[event].length : 0;
  };
  window.__mockListen = listen;
  window.__setMockTimerState = (state: [number, boolean, string] | null) => {
    mockTimerState = state;
  };
  window.__delayNextTimerState = (ms: number) => {
    mockTimerStateDelayMs = ms;
  };
}
