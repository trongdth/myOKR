import { useState, useEffect, lazy, Suspense } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './styles/global.css';
import './styles/app.css';
import PomodoroApp from './components/PomodoroApp';
import FocusApp from './components/FocusApp';
import SessionWidget from './components/session/SessionWidget';
import { ErrorBoundary } from './components/ErrorBoundary';
import { loadWalkthroughState, saveWalkthroughState, shouldShowWalkthrough, type WalkthroughState } from './lib/okr-storage';
import { flushAutomergeQueue } from './lib/automerge-storage';
import { Target, BarChart2, Settings as SettingsIcon, ChevronRight, ChevronDown, HelpCircle, Clock } from 'lucide-react';
import { LogoMark } from './components/shared/LogoMark';

const OKRApp = lazy(() => import('./components/OKRApp'));
const ReviewApp = lazy(() => import('./components/ReviewApp'));
const SettingsApp = lazy(() => import('./components/SettingsApp'));
const HelpApp = lazy(() => import('./components/HelpApp'));
const Walkthrough = lazy(() => import('./components/Walkthrough'));
const HabitsApp = lazy(() => import('./components/HabitsApp'));

export type Section =
  | 'day-plan'
  | 'session'
  | 'habits'
  | 'tasks'
  | 'objectives'
  | 'done'
  | 'analytics'
  | 'weekly-review'
  | 'settings'
  | 'help';

export function migrateSection(legacy: string | null): Section {
  if (!legacy) return 'day-plan';
  switch (legacy) {
    case 'today': return 'day-plan';
    case 'pomodoro-timer': return 'session';
    case 'habits': return 'habits';
    case 'pomodoro-tasks': return 'tasks';
    case 'okrs': return 'objectives';
    case 'pomodoro-analytics': return 'analytics';
    case 'review': return 'weekly-review';
    case 'sync': return 'settings';
    case 'cloud sync': return 'settings';
    case 'session-defaults': return 'settings';
    case 'settings': return 'settings';
    case 'help': return 'help';
    default:
      if (['day-plan', 'session', 'habits', 'tasks', 'objectives', 'done', 'analytics', 'weekly-review', 'settings', 'help'].includes(legacy)) {
        return legacy as Section;
      }
      return 'day-plan';
  }
}

export interface NavSubItem {
  id: Section;
  label: string;
}

export interface NavGroup {
  id: string;
  label: string;
  icon: React.ReactNode;
  defaultTab: Section;
  items: NavSubItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    id: 'focus',
    label: 'Focus',
    icon: <Clock size={18} />,
    defaultTab: 'day-plan',
    items: [
      { id: 'day-plan', label: 'Day plan' },
      { id: 'session', label: 'Session' },
      { id: 'habits', label: 'Habits' },
    ],
  },
  {
    id: 'plan',
    label: 'Plan',
    icon: <Target size={18} />,
    defaultTab: 'tasks',
    items: [
      { id: 'tasks', label: 'Tasks' },
      { id: 'objectives', label: 'Objectives' },
      { id: 'done', label: 'Done' },
    ],
  },
  {
    id: 'progress',
    label: 'Progress',
    icon: <BarChart2 size={18} />,
    defaultTab: 'analytics',
    items: [
      { id: 'analytics', label: 'Analytics' },
      { id: 'weekly-review', label: 'Weekly review' },
    ],
  },
];

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>(() => {
    const stored = localStorage.getItem('myokr_active_section');
    return migrateSection(stored);
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [requestedTaskId, setRequestedTaskId] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState(0);
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({
    focus: false,
    plan: true,
    progress: true,
  });
  const [isSyncConnected, setIsSyncConnected] = useState(() =>
    !!(localStorage.getItem('dropbox_client_id') && localStorage.getItem('dropbox_refresh_token'))
  );

  useEffect(() => {
    const handleStatusChange = () => {
      setIsSyncConnected(!!(localStorage.getItem('dropbox_client_id') && localStorage.getItem('dropbox_refresh_token')));
    };
    window.addEventListener('myokr-sync-status-changed', handleStatusChange);
    return () => window.removeEventListener('myokr-sync-status-changed', handleStatusChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let unlisten: (() => void) | null = null;
    let isClosing = false;

    const promise = listen('window-close-requested', async () => {
      if (isClosing) return;
      isClosing = true;
      try {
        await flushAutomergeQueue(5000);
      } catch (err) {
        console.error('Failed to flush Automerge queue on close:', err);
      } finally {
        if (!cancelled) {
          invoke('hide_window').catch(console.error);
        }
        isClosing = false;
      }
    });

    promise.then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    }).catch(console.error);

    const cleanup = () => {
      cancelled = true;
      if (unlisten) {
        unlisten();
      } else {
        promise.then((fn) => fn()).catch(console.error);
      }
    };

    if (import.meta.env.DEV) {
      window.__cleanupCloseHandler = cleanup;
    }

    return cleanup;
  }, []);

  useEffect(() => {
    loadWalkthroughState().then((state: WalkthroughState) => {
      setShowWalkthrough(shouldShowWalkthrough(state));
    });
  }, []);

  useEffect(() => {
    const handleNavigate = (e: Event) => {
      const section = migrateSection((e as CustomEvent).detail);
      if (section) {
        handleNavClick(section);
      }
    };
    window.addEventListener('myokr-navigate-to-section', handleNavigate);
    return () => window.removeEventListener('myokr-navigate-to-section', handleNavigate);
  }, []);

  useEffect(() => {
    if (!isSyncConnected) return;

    const handleSyncError = (e: any) => {
      console.error(e);
      if (e?.status === 401) {
        localStorage.removeItem('dropbox_client_id');
        localStorage.removeItem('dropbox_refresh_token');
        window.dispatchEvent(new CustomEvent('myokr-sync-status-changed'));
      }
    };

    const performSync = () => {
      const currentClientId = localStorage.getItem('dropbox_client_id');
      const currentRefreshToken = localStorage.getItem('dropbox_refresh_token');
      if (!currentClientId || !currentRefreshToken) return;
      import('./lib/dropbox-service').then(({ syncWithDropbox }) => {
        syncWithDropbox(currentClientId, currentRefreshToken).then(() => {
          const now = new Date().toLocaleString();
          localStorage.setItem('last_sync_time', now);
          window.dispatchEvent(new CustomEvent('myokr-data-synced'));
        }).catch(handleSyncError);
      }).catch(handleSyncError);
    };

    const timeoutId = setTimeout(performSync, 5000);
    const intervalId = window.setInterval(performSync, 15 * 60 * 1000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [isSyncConnected]);

  const handleWalkthroughComplete = (dismissed: boolean) => {
    setShowWalkthrough(false);
    const newState: WalkthroughState = dismissed ? 'dismissed' : 'seen';
    saveWalkthroughState(newState).catch(console.error);
  };

  const handleNavClick = (id: Section) => {
    setActiveSection(id);
    localStorage.setItem('myokr_active_section', id);
    setSidebarOpen(false);
    if (id !== 'session') setRequestedTaskId(null);
    if (id === 'day-plan') setTodayKey(k => k + 1);

    const parentGroup = NAV_GROUPS.find(g => g.items.some(item => item.id === id));
    if (parentGroup) {
      setCollapsedGroups(prev => ({ ...prev, [parentGroup.id]: false }));
    }
  };

  const toggleGroup = (groupId: string, defaultTab: Section, isGroupActive: boolean) => {
    setCollapsedGroups(prev => {
      const willBeCollapsed = !prev[groupId];
      if (!willBeCollapsed && !isGroupActive) {
        handleNavClick(defaultTab);
      }
      return { ...prev, [groupId]: willBeCollapsed };
    });
  };

  const handleStartFromToday = (taskId: string) => {
    setRequestedTaskId(taskId);
    setActiveSection('session');
    localStorage.setItem('myokr_active_section', 'session');
    setSidebarOpen(false);
  };

  return (
    <>
    <div className="app-layout">
      {/* Mobile overlay backdrop */}
      {sidebarOpen && (
        <div
          className="sidebar-overlay"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside className={`app-sidebar${sidebarOpen ? ' sidebar-open' : ''}`}>
        <div className="app-sidebar-logo">
          <span className="app-sidebar-logo-icon"><LogoMark size={24} /></span>
          <span className="app-sidebar-logo-text">myOKR</span>
        </div>
        <nav className="app-sidebar-nav">
          {NAV_GROUPS.map(g => {
            const isGroupActive = g.items.some(item => item.id === activeSection);
            const isExpanded = !collapsedGroups[g.id];

            return (
              <div key={g.id} className={`nav-group${isGroupActive ? ' has-active' : ''}`}>
                <button
                  type="button"
                  className={`sidebar-nav-header${isGroupActive ? ' active' : ''}`}
                  title={g.label}
                  onClick={() => toggleGroup(g.id, g.defaultTab, isGroupActive)}
                >
                  <span className="sidebar-nav-icon">{g.icon}</span>
                  <span className="sidebar-nav-label">{g.label}</span>
                  <span className="group-chevron">
                    {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </span>
                </button>
                {isExpanded && (
                  <div className="nav-group-items">
                    {g.items.map(item => (
                      <button
                        key={item.id}
                        type="button"
                        title={item.label}
                        className={`sidebar-nav-item sub-item${activeSection === item.id ? ' active' : ''}`}
                        onClick={() => handleNavClick(item.id)}
                      >
                        <span className="sidebar-nav-label">{item.label}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>

        <div className="sidebar-bottom-section">
          <button
            type="button"
            className={`sidebar-nav-item bottom-item${activeSection === 'settings' ? ' active' : ''}`}
            title="Settings"
            onClick={() => handleNavClick('settings')}
          >
            <span className="sidebar-nav-icon"><SettingsIcon size={18} /></span>
            <span className="sidebar-nav-label">Settings</span>
            <span className={`sync-status-dot ${isSyncConnected ? 'connected' : 'disconnected'}`} title={isSyncConnected ? 'Sync connected' : 'Not connected'} />
          </button>

          <button
            type="button"
            className={`sidebar-nav-item bottom-item help-item${activeSection === 'help' ? ' active' : ''}`}
            title="Help & tour"
            onClick={() => handleNavClick('help')}
          >
            <span className="sidebar-nav-icon"><HelpCircle size={18} /></span>
            <span className="sidebar-nav-label">Help & tour</span>
          </button>

          <div className="sidebar-version-tag">v{__APP_VERSION__}</div>
        </div>
      </aside>

      {/* Main content */}
      <main className="app-main">
        {/* Mobile top bar with hamburger */}
        <div className="mobile-topbar">
          <button
            className="hamburger-btn"
            onClick={() => setSidebarOpen(v => !v)}
            aria-label="Toggle navigation"
            aria-expanded={sidebarOpen}
          >
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>
          <span className="mobile-topbar-logo"><LogoMark size={20} /> <strong>myOKR</strong></span>
        </div>

        {['session', 'tasks', 'done', 'analytics'].includes(activeSection) && (
          <ErrorBoundary mode="section">
            <PomodoroApp
              tab={activeSection === 'session' ? 'timer' : activeSection === 'tasks' ? 'tasks' : activeSection === 'done' ? 'done' : 'analytics'}
              requestedTaskId={requestedTaskId}
              onRequestedTaskConsumed={() => setRequestedTaskId(null)}
            />
          </ErrorBoundary>
        )}
        {activeSection === 'day-plan' && (
          <ErrorBoundary mode="section">
            <FocusApp key={todayKey} tab="day-plan" onStartTask={handleStartFromToday} onGoToTasks={() => handleNavClick('tasks')} />
          </ErrorBoundary>
        )}
        <Suspense fallback={<div className="loading-fallback" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%', color: 'var(--text-secondary)' }}>Loading...</div>}>
          {activeSection === 'objectives' && (
            <ErrorBoundary mode="section"><OKRApp key="okrs" /></ErrorBoundary>
          )}
          {activeSection === 'habits' && (
            <ErrorBoundary mode="section"><HabitsApp key="habits" /></ErrorBoundary>
          )}
          {activeSection === 'weekly-review' && (
            <ErrorBoundary mode="section"><ReviewApp key="review" /></ErrorBoundary>
          )}
          {activeSection === 'settings' && (
            <ErrorBoundary mode="section"><SettingsApp key="settings" /></ErrorBoundary>
          )}
          {activeSection === 'help' && (
            <ErrorBoundary mode="section"><HelpApp key="help" /></ErrorBoundary>
          )}
        </Suspense>
      </main>
    </div>
    <SessionWidget activeSection={activeSection} onOpen={() => setActiveSection('session')} />
    {showWalkthrough && (
      <Suspense fallback={null}>
        <Walkthrough onComplete={handleWalkthroughComplete} />
      </Suspense>
    )}
    </>
  );
}
