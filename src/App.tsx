import { useState, useEffect, lazy, Suspense } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import './styles/global.css';
import './styles/app.css';
import PomodoroApp from './components/PomodoroApp';
import TodayApp from './components/TodayApp';
import { ErrorBoundary } from './components/ErrorBoundary';
import { loadWalkthroughState, saveWalkthroughState, shouldShowWalkthrough, type WalkthroughState } from './lib/okr-storage';
import { flushAutomergeQueue } from './lib/automerge-storage';
import { Clock, Timer, SquareCheck, BarChart3, Target, CalendarCheck, FileText, Upload, BookOpen } from 'lucide-react';
import { LogoMark } from './components/shared/LogoMark';

const OKRApp = lazy(() => import('./components/OKRApp'));
const ReviewApp = lazy(() => import('./components/ReviewApp'));
const SyncApp = lazy(() => import('./components/SyncApp'));
const Walkthrough = lazy(() => import('./components/Walkthrough'));
const HabitsApp = lazy(() => import('./components/HabitsApp'));

type Section = 'today' | 'pomodoro-timer' | 'pomodoro-tasks' | 'pomodoro-analytics' | 'okrs' | 'review' | 'sync' | 'habits';

const HELP_BLOG_URL = 'https://code4food.work/blog/effective-okrs-with-myokr';

const NAV_ITEMS: { id: Section | 'pomodoro-header'; label: string; icon: React.ReactNode; isHeader?: boolean; isSubItem?: boolean }[] = [
  { id: 'today', label: 'Today', icon: <Clock size={18} /> },
  { id: 'pomodoro-header', label: 'Pomodoro', isHeader: true, icon: <Timer size={18} /> },
  { id: 'pomodoro-timer', label: 'Timer', isSubItem: true, icon: <Timer size={16} /> },
  { id: 'pomodoro-tasks', label: 'Tasks', isSubItem: true, icon: <SquareCheck size={16} /> },
  { id: 'pomodoro-analytics', label: 'Analytics', isSubItem: true, icon: <BarChart3 size={16} /> },
  { id: 'okrs', label: 'OKRs', icon: <Target size={18} /> },
  { id: 'habits', label: 'Habits', icon: <CalendarCheck size={18} /> },
  { id: 'review', label: 'Review', icon: <FileText size={18} /> },
  { id: 'sync', label: 'Cloud Sync', icon: <Upload size={18} /> },
];

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>(() => {
    return (localStorage.getItem('myokr_active_section') as Section) || 'today';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  // Start false so the app shell paints immediately; the walkthrough (if any)
  // is shown as an overlay once loadWalkthroughState() resolves. This avoids
  // blocking first paint on the Automerge doc load (the doc is lazy-loaded by
  // the section components, which render their own loading states).
  const [showWalkthrough, setShowWalkthrough] = useState(false);
  const [requestedTaskId, setRequestedTaskId] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState(0);
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

  // Handle Tauri window close request by flushing the Automerge queue before hiding the window
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
      const section = (e as CustomEvent).detail as Section;
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

    // Run once on load/connect after a short delay
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
    if (id !== 'pomodoro-timer') setRequestedTaskId(null);
    if (id === 'today') setTodayKey(k => k + 1);
  };

  const handleStartFromToday = (taskId: string) => {
    setRequestedTaskId(taskId);
    setActiveSection('pomodoro-timer');
    localStorage.setItem('myokr_active_section', 'pomodoro-timer');
    setSidebarOpen(false);
  };

  // Group nav items so the Pomodoro header owns its sub-items. In the collapsed
  // icon-rail (Turn-2/2a) the sub-items move into a hover flyout off the header.
  type NavItem = (typeof NAV_ITEMS)[number];
  const navGroups: { header?: NavItem; items: NavItem[]; single?: NavItem }[] = [];
  for (const item of NAV_ITEMS) {
    if (item.isHeader) {
      navGroups.push({ header: item, items: [] });
    } else if (item.isSubItem && navGroups.length && navGroups[navGroups.length - 1].header) {
      navGroups[navGroups.length - 1].items.push(item);
    } else {
      navGroups.push({ single: item, items: [] });
    }
  }

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
          {navGroups.map(g => {
            if (g.single) {
              const item = g.single;
              return (
                <button
                  key={item.id}
                  title={item.label}
                  className={`sidebar-nav-item${activeSection === item.id ? ' active' : ''}`}
                  onClick={() => handleNavClick(item.id as Section)}
                >
                  <span className="sidebar-nav-icon">{item.icon}</span>
                  <span className="sidebar-nav-label">{item.label}</span>
                </button>
              );
            }
            const header = g.header!;
            const headerActive = activeSection.startsWith('pomodoro-');
            return (
              <div key={header.id} className={`nav-group${headerActive ? ' has-active' : ''}`}>
                <div className="sidebar-nav-header" title={header.label}>
                  <span className="sidebar-nav-icon">{header.icon}</span>
                  <span className="sidebar-nav-label">{header.label}</span>
                </div>
                <div className="nav-group-items">
                  {g.items.map(item => (
                    <button
                      key={item.id}
                      title={item.label}
                      className={`sidebar-nav-item sub-item${activeSection === item.id ? ' active' : ''}`}
                      onClick={() => handleNavClick(item.id as Section)}
                    >
                      <span className="sidebar-nav-icon">{item.icon}</span>
                      <span className="sidebar-nav-label">{item.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-footer-version">v{__APP_VERSION__}</div>
          <div className="sidebar-footer-author">
            Author: <a href="#" onClick={(e) => {
              e.preventDefault();
              invoke('open_external', { url: 'https://mail.google.com/mail/?view=cm&to=trongdth@gmail.com' });
            }}>Trong Dinh</a>
          </div>
          <div className="sidebar-footer-help">
            <a href="#" onClick={(e) => {
              e.preventDefault();
              invoke('open_external', { url: HELP_BLOG_URL });
            }}><BookOpen size={14} style={{ verticalAlign: 'text-bottom' }} /> Effective OKR guide</a>
          </div>
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

        <div style={{ display: activeSection.startsWith('pomodoro-') ? 'contents' : 'none' }}>
          <ErrorBoundary mode="section">
            <PomodoroApp key="pomodoro" tab={(activeSection.startsWith('pomodoro-') ? activeSection.replace('pomodoro-', '') : 'timer') as 'timer' | 'tasks' | 'analytics'} requestedTaskId={requestedTaskId} onRequestedTaskConsumed={() => setRequestedTaskId(null)} />
          </ErrorBoundary>
        </div>
        {activeSection === 'today' && (
          <ErrorBoundary mode="section">
            <TodayApp key={todayKey} onStartTask={handleStartFromToday} onGoToTasks={() => handleNavClick('pomodoro-tasks')} />
          </ErrorBoundary>
        )}
        <Suspense fallback={<div className="loading-fallback" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%', color: 'var(--text-secondary)' }}>Loading...</div>}>
          {activeSection === 'okrs' && (
            <ErrorBoundary mode="section"><OKRApp key="okrs" /></ErrorBoundary>
          )}
          {activeSection === 'habits' && (
            <ErrorBoundary mode="section"><HabitsApp key="habits" /></ErrorBoundary>
          )}
          {activeSection === 'review' && (
            <ErrorBoundary mode="section"><ReviewApp key="review" /></ErrorBoundary>
          )}
          {activeSection === 'sync' && (
            <ErrorBoundary mode="section"><SyncApp /></ErrorBoundary>
          )}
        </Suspense>
      </main>
    </div>
    {showWalkthrough && (
      <Suspense fallback={null}>
        <Walkthrough onComplete={handleWalkthroughComplete} />
      </Suspense>
    )}
    </>
  );
}
