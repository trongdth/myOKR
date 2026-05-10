import { useState } from 'react';
import './styles/global.css';
import './styles/app.css';
import PomodoroApp from './components/PomodoroApp';
import OKRApp from './components/OKRApp';
import ReviewApp from './components/ReviewApp';

type Section = 'pomodoro-timer' | 'pomodoro-tasks' | 'pomodoro-analytics' | 'okrs' | 'review';

const NAV_ITEMS: { id: Section | 'pomodoro-header'; label: string; icon: React.ReactNode; isHeader?: boolean; isSubItem?: boolean }[] = [
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
];

export default function App() {
  const [activeSection, setActiveSection] = useState<Section>('pomodoro-timer');

  return (
    <div className="app-layout">
      {/* Sidebar */}
      <aside className="app-sidebar">
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
                onClick={() => setActiveSection(item.id as Section)}
              >
                <span className="sidebar-nav-icon">{item.icon}</span>
                <span className="sidebar-nav-label">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* Main content */}
      <main className="app-main">
        {activeSection.startsWith('pomodoro-') && <PomodoroApp tab={activeSection.replace('pomodoro-', '') as 'timer' | 'tasks' | 'analytics'} />}
        {activeSection === 'okrs' && <OKRApp />}
        {activeSection === 'review' && <ReviewApp />}
      </main>
    </div>
  );
}
