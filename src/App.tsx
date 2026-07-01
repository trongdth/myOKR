import { useState, useEffect, lazy, Suspense } from 'react';
import { invoke } from '@tauri-apps/api/core';
import './styles/global.css';
import './styles/app.css';
import PomodoroApp from './components/PomodoroApp';
import TodayApp from './components/TodayApp';
import { loadWalkthroughState, saveWalkthroughState, shouldShowWalkthrough, type WalkthroughState } from './lib/okr-storage';

const OKRApp = lazy(() => import('./components/OKRApp'));
const ReviewApp = lazy(() => import('./components/ReviewApp'));
const SyncApp = lazy(() => import('./components/SyncApp'));
const Walkthrough = lazy(() => import('./components/Walkthrough'));

type Section = 'today' | 'pomodoro-timer' | 'pomodoro-tasks' | 'pomodoro-analytics' | 'okrs' | 'review' | 'sync';

const HELP_BLOG_URL = 'https://code4food.work/blog/effective-okrs-with-myokr';

const NAV_ITEMS: { id: Section | 'pomodoro-header'; label: string; icon: React.ReactNode; isHeader?: boolean; isSubItem?: boolean }[] = [
  {
    id: 'today',
    label: 'Today',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <polyline points="12 6 12 12 16 14" />
      </svg>
    ),
  },
  {
    id: 'pomodoro-header',
    label: 'Pomodoro',
    isHeader: true,
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="13" r="8" />
        <path d="M12 9v4l2 2" />
        <path d="M5 3L2 6" />
        <path d="M22 6l-3-3" />
      </svg>
    ),
  },
  {
    id: 'pomodoro-timer',
    label: 'Timer',
    isSubItem: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2"/><path d="M5 3L2 6"/><path d="M22 6l-3-3"/></svg>
    ),
  },
  {
    id: 'pomodoro-tasks',
    label: 'Tasks',
    isSubItem: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
    ),
  },
  {
    id: 'pomodoro-analytics',
    label: 'Analytics',
    isSubItem: true,
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 20V10"/><path d="M12 20V4"/><path d="M6 20v-6"/></svg>
    ),
  },
  {
    id: 'okrs',
    label: 'OKRs',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
        <circle cx="12" cy="12" r="6" />
        <circle cx="12" cy="12" r="2" />
      </svg>
    ),
  },
  {
    id: 'review',
    label: 'Review',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
        <polyline points="14 2 14 8 20 8" />
        <line x1="16" y1="13" x2="8" y2="13" />
        <line x1="16" y1="17" x2="8" y2="17" />
        <polyline points="10 9 9 9 8 9" />
      </svg>
    ),
  },
  {
    id: 'sync',
    label: 'Cloud Sync',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
    ),
  },
];

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>(() => {
    return (localStorage.getItem('myokr_active_section') as Section) || 'today';
  });
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showWalkthrough, setShowWalkthrough] = useState<boolean | null>(null);
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

  useEffect(() => {
    loadWalkthroughState().then((state: WalkthroughState) => {
      setShowWalkthrough(shouldShowWalkthrough(state));
    });
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

    // Run once on load/connect after a short delay
    const timeoutId = setTimeout(() => {
      const currentClientId = localStorage.getItem('dropbox_client_id');
      const currentRefreshToken = localStorage.getItem('dropbox_refresh_token');
      if (!currentClientId || !currentRefreshToken) return;
      import('./lib/dropbox-service').then(({ syncWithDropbox }) => {
        syncWithDropbox(currentClientId, currentRefreshToken).then(() => {
          const now = new Date().toLocaleString();
          localStorage.setItem('last_sync_time', now);
          window.dispatchEvent(new CustomEvent('myokr-data-synced'));
        }).catch(handleSyncError);
      });
    }, 5000);

    const intervalId = window.setInterval(() => {
      const currentClientId = localStorage.getItem('dropbox_client_id');
      const currentRefreshToken = localStorage.getItem('dropbox_refresh_token');
      if (!currentClientId || !currentRefreshToken) {
        window.dispatchEvent(new CustomEvent('myokr-sync-status-changed'));
        return;
      }
      import('./lib/dropbox-service').then(({ syncWithDropbox }) => {
        syncWithDropbox(currentClientId, currentRefreshToken).then(() => {
          const now = new Date().toLocaleString();
          localStorage.setItem('last_sync_time', now);
          window.dispatchEvent(new CustomEvent('myokr-data-synced'));
        }).catch(handleSyncError);
      });
    }, 5 * 60 * 1000);

    return () => {
      clearTimeout(timeoutId);
      clearInterval(intervalId);
    };
  }, [isSyncConnected]);

  const handleWalkthroughComplete = async (dismissed: boolean) => {
    const newState: WalkthroughState = dismissed ? 'dismissed' : 'seen';
    await saveWalkthroughState(newState);
    setShowWalkthrough(false);
  };

  if (showWalkthrough === null) return null;

  if (showWalkthrough) {
    return (
      <Suspense fallback={null}>
        <Walkthrough onComplete={handleWalkthroughComplete} />
      </Suspense>
    );
  }

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

  return (
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
          <span className="app-sidebar-logo-icon">🎯</span>
          <span className="app-sidebar-logo-text">myOKR</span>
        </div>
        <nav className="app-sidebar-nav">
          {NAV_ITEMS.map(item => {
            if (item.isHeader) {
              return (
                <div key={item.id} className="sidebar-nav-header" style={{ display: 'flex', alignItems: 'center', gap: '0.75em', padding: '0.7em 0.85em', color: 'var(--text-primary)', fontWeight: 600, fontSize: '0.95rem', marginTop: '0.5em' }}>
                  <span className="sidebar-nav-icon">{item.icon}</span>
                  <span className="sidebar-nav-label">{item.label}</span>
                </div>
              );
            }
            return (
              <button
                key={item.id}
                className={`sidebar-nav-item${activeSection === item.id ? ' active' : ''}${item.isSubItem ? ' sub-item' : ''}`}
                onClick={() => handleNavClick(item.id as Section)}
              >
                <span className="sidebar-nav-icon">{item.icon}</span>
                <span className="sidebar-nav-label">{item.label}</span>
              </button>
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
            }}>📖 Effective OKR guide</a>
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
          <span className="mobile-topbar-logo">🎯 <strong>myOKR</strong></span>
        </div>

        <div style={{ display: activeSection.startsWith('pomodoro-') ? 'contents' : 'none' }}>
          <PomodoroApp key="pomodoro" tab={(activeSection.startsWith('pomodoro-') ? activeSection.replace('pomodoro-', '') : 'timer') as 'timer' | 'tasks' | 'analytics'} requestedTaskId={requestedTaskId} onRequestedTaskConsumed={() => setRequestedTaskId(null)} />
        </div>
        {activeSection === 'today' && <TodayApp key={todayKey} onStartTask={handleStartFromToday} onGoToTasks={() => handleNavClick('pomodoro-tasks')} />}
        <Suspense fallback={<div className="loading-fallback" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100%', color: 'var(--text-secondary)' }}>Loading...</div>}>
          {activeSection === 'okrs' && <OKRApp key="okrs" />}
          {activeSection === 'review' && <ReviewApp key="review" />}
          {activeSection === 'sync' && <SyncApp />}
        </Suspense>
      </main>
    </div>
  );
}
