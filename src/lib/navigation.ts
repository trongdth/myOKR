/** App-wide section navigation: dispatches the event the shell (App.tsx)
 *  listens for. Lives in lib/ because any feature group (Plan, Focus, …)
 *  navigates to any section — it is not owned by the pomodoro group. */
export function navigateToSection(section: string) {
  window.dispatchEvent(new CustomEvent('myokr-navigate-to-section', { detail: section }));
}
