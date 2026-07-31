import { useState } from 'react';
import SyncApp from './SyncApp';
import SessionDefaultsApp from './SessionDefaultsApp';
import '../styles/app.css';

export default function SettingsApp() {
  const [activeTab, setActiveTab] = useState<'sync' | 'session-defaults'>('sync');

  return (
    <div className="settings-page-container">
      <div className="settings-header-tabs">
        <button
          type="button"
          className={`settings-tab-button ${activeTab === 'sync' ? 'active' : ''}`}
          onClick={() => setActiveTab('sync')}
        >
          Sync
        </button>
        <button
          type="button"
          className={`settings-tab-button ${activeTab === 'session-defaults' ? 'active' : ''}`}
          onClick={() => setActiveTab('session-defaults')}
        >
          Session defaults
        </button>
      </div>

      <div className="settings-tab-body">
        {activeTab === 'sync' && <SyncApp />}
        {activeTab === 'session-defaults' && <SessionDefaultsApp />}
      </div>
    </div>
  );
}
