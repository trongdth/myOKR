import { useState, useEffect } from 'react';
import SyncApp from './SyncApp';
import SessionDefaultsApp from './SessionDefaultsApp';
import SettingsTabStrip, { SettingsHeader } from './settings/SettingsTabStrip';
import { DROPBOX_KEYS, loadCredentials } from '../lib/credential-store';
import { tauriCredentialStore } from '../lib/tauri-credential-adapter';
import {
  getSessionSettingsTab,
  setSessionSettingsTab,
  type SettingsTab,
} from '../lib/navigation';
import '../styles/settings.css';

export default function SettingsApp() {
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => getSessionSettingsTab());
  const [isConnected, setIsConnected] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const refreshConnection = async () => {
      const creds = await loadCredentials(tauriCredentialStore, DROPBOX_KEYS);
      if (!cancelled) {
        setIsConnected(!!(creds.dropbox_client_id && creds.dropbox_refresh_token));
      }
    };
    void refreshConnection();
    const handleStatusChange = () => {
      void refreshConnection();
    };
    window.addEventListener('myokr-sync-status-changed', handleStatusChange);
    return () => {
      cancelled = true;
      window.removeEventListener('myokr-sync-status-changed', handleStatusChange);
    };
  }, []);

  useEffect(() => {
    const handleRequestedTab = (e: Event) => {
      const requested = (e as CustomEvent<SettingsTab>).detail;
      if (requested === 'session-defaults' || requested === 'sync') {
        setSessionSettingsTab(requested);
        setActiveTab(requested);
      }
    };
    window.addEventListener('myokr-settings-tab', handleRequestedTab);
    return () => window.removeEventListener('myokr-settings-tab', handleRequestedTab);
  }, []);

  const handleSelectTab = (tab: SettingsTab) => {
    setSessionSettingsTab(tab);
    setActiveTab(tab);
  };

  return (
    <div className="pomodoro-container settings-shell">
      <div className="settings-shell-inner">
        <SettingsHeader active={activeTab} isConnected={isConnected} />
        <SettingsTabStrip
          active={activeTab}
          onSelectTab={handleSelectTab}
          isConnected={isConnected}
        />
        {activeTab === 'session-defaults' && <SessionDefaultsApp />}
        {activeTab === 'sync' && <SyncApp />}
      </div>
    </div>
  );
}
