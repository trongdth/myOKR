import { BookOpen, ExternalLink, User, RefreshCw } from 'lucide-react';
import '../styles/app.css';

export default function HelpApp() {
  const handleRelaunchTour = () => {
    try {
      window.localStorage.removeItem('myokr_walkthrough_state');
      window.location.reload();
    } catch (e) {
      console.error('Failed to reset walkthrough state:', e);
    }
  };

  return (
    <div className="help-app-container">
      <header className="help-header">
        <h1 className="help-title">Help & tour</h1>
        <p className="help-subtitle">
          Guides, best practices, and information to help you master OKRs with myOKR.
        </p>
      </header>

      <div className="help-grid">
        {/* Onboarding Tour Card */}
        <div className="help-card">
          <div className="help-card-header">
            <RefreshCw className="help-card-icon" size={20} />
            <h2>Interactive Product Tour</h2>
          </div>
          <p>
            Re-take the step-by-step walkthrough of myOKR to learn about Focus planning, OKRs, Habits, and Syncing.
          </p>
          <button
            type="button"
            className="btn-primary relaunch-tour-btn"
            onClick={handleRelaunchTour}
          >
            Re-launch Onboarding Tour
          </button>
        </div>

        {/* Effective OKR Guide Card */}
        <div className="help-card">
          <div className="help-card-header">
            <BookOpen className="help-card-icon" size={20} />
            <h2>Effective OKR Guide</h2>
          </div>
          <div className="okr-guide-content">
            <h3>Objectives (What you want to achieve)</h3>
            <ul>
              <li>Keep objectives inspirational, qualitative, and memorable.</li>
              <li>Aim for 3–5 active objectives per cycle to stay focused.</li>
            </ul>

            <h3>Key Results (How you measure success)</h3>
            <ul>
              <li><strong>Manual:</strong> Directly enter numeric progress values.</li>
              <li><strong>Task progress / Pomodoros:</strong> Automatically sync from focus sessions.</li>
              <li><strong>Habit ticks:</strong> Link to daily habits for automatic progress updates.</li>
            </ul>

            <h3>Best Practices</h3>
            <ul>
              <li>Review your confidence ratings (On Track, At Risk, Off Track) during Weekly Reviews.</li>
              <li>Break down large objectives into 2–4 measurable Key Results.</li>
            </ul>
          </div>
          <a
            href="https://github.com/trongdth/myOKR"
            target="_blank"
            rel="noopener noreferrer"
            className="guide-external-link"
          >
            Learn more about Effective OKRs <ExternalLink size={14} />
          </a>
        </div>

        {/* Author & Application Info Card */}
        <div className="help-card">
          <div className="help-card-header">
            <User className="help-card-icon" size={20} />
            <h2>Author & Application Info</h2>
          </div>
          <div className="author-info">
            <p><strong>App:</strong> myOKR (Desktop & Mobile)</p>
            <p><strong>Version:</strong> v0.3.0</p>
            <p><strong>Author:</strong> Trong Duong</p>
            <p className="author-desc">
              Built with Tauri, React, TypeScript, Flutter, and Automerge CRDTs for seamless local-first offline syncing.
            </p>
            <div className="author-links">
              <a
                href="https://github.com/trongdth/myOKR"
                target="_blank"
                rel="noopener noreferrer"
                className="btn-secondary github-link"
              >
                GitHub Repository <ExternalLink size={14} />
              </a>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
