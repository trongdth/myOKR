import { Check } from 'lucide-react';
import type { SettingsTab } from '../../lib/navigation';

interface SettingsHeaderProps {
  active: SettingsTab;
  isConnected: boolean;
}

/**
 * Settings-group header — mirrors FocusHeader / PlanHeader / ProgressHeader:
 * mono "SETTINGS" eyebrow above the active tab's h1 title, with an inline
 * "Connected" chip on Cloud sync when Dropbox credentials are active.
 */
export function SettingsHeader({ active, isConnected }: SettingsHeaderProps) {
  const title = active === 'session-defaults' ? 'Session defaults' : 'Cloud sync';

  return (
    <div className="tasks-view-header settings-header">
      <div className="tasks-header-left">
        <h2 className="plan-header-eyebrow tasks-title">SETTINGS</h2>
        <div className="plan-header-title-row">
          <h1 className="plan-header-title settings-header-title">{title}</h1>
          {active === 'sync' && isConnected && (
            <span className="settings-connected-chip">
              <Check size={12} strokeWidth={3} /> Connected
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

interface SettingsTabStripProps {
  active: SettingsTab;
  onSelectTab: (tab: SettingsTab) => void;
  isConnected: boolean;
}

/**
 * Settings in-content tab strip — reuses .plan-tab-strip / .plan-tab styles
 * for exact visual parity with Focus, Plan, and Progress.
 */
export default function SettingsTabStrip({
  active,
  onSelectTab,
  isConnected,
}: SettingsTabStripProps) {
  return (
    <div className="plan-tab-strip settings-tabs">
      <div className="plan-tabs">
        <button
          type="button"
          className={`plan-tab${active === 'session-defaults' ? ' active' : ''}`}
          onClick={() => onSelectTab('session-defaults')}
        >
          <span>Session defaults</span>
        </button>
        <button
          type="button"
          className={`plan-tab${active === 'sync' ? ' active' : ''}`}
          onClick={() => onSelectTab('sync')}
        >
          <span>Cloud sync</span>
          {isConnected && (
            <span className="plan-tab-count settings-tab-connected">connected</span>
          )}
        </button>
      </div>
      <span className="plan-cycle-week settings-strip-meta">
        v{__APP_VERSION__} · Local-first
      </span>
    </div>
  );
}
