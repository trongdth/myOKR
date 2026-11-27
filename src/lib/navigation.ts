/** App-wide section navigation: dispatches the event the shell (App.tsx)
 *  listens for. Lives in lib/ because any feature group (Plan, Focus, …)
 *  navigates to any section — it is not owned by the pomodoro group. */
export function navigateToSection(section: string) {
  window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: section }));
}

export type SettingsTab = 'session-defaults' | 'sync';

/** Session-scoped active Settings tab — persists across section switches within
 *  one app session while starting every fresh launch on `session-defaults`
 *  (mirrors CommandKModal's session-scoped filter posture in design-system.md). */
let sessionSettingsTab: SettingsTab = 'session-defaults';

export function getSessionSettingsTab(): SettingsTab {
  return sessionSettingsTab;
}

export function setSessionSettingsTab(tab: SettingsTab): void {
  sessionSettingsTab = tab;
}

export function resolveSettingsTabTarget(rawSection: string | null | undefined): SettingsTab | null {
  if (!rawSection) return null;
  if (rawSection === 'sync' || rawSection === 'cloud sync' || rawSection === 'cloud-sync') {
    return 'sync';
  }
  if (rawSection === 'session-defaults') {
    return 'session-defaults';
  }
  return null;
}

export function requestSettingsTab(tab: SettingsTab): void {
  sessionSettingsTab = tab;
  window.dispatchEvent(new CustomEvent('myokr-settings-tab', { detail: tab }));
}
