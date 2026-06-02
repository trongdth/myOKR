import { useState, useEffect } from 'react';
import { validateDropboxToken, syncWithDropbox } from '../lib/dropbox-service';
import '../styles/app.css';

const TOKEN_KEY = 'dropbox_access_token';

export default function SyncApp() {
  const [token, setToken] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_KEY);
    if (savedToken) {
      setToken(savedToken);
      setIsConnected(true);
    }
    const last = localStorage.getItem('last_sync_time');
    if (last) setLastSync(last);
  }, []);

  const handleConnect = async () => {
    if (!token.trim()) return;
    setError(null);
    setIsSyncing(true);
    try {
      const valid = await validateDropboxToken(token);
      if (valid) {
        localStorage.setItem(TOKEN_KEY, token);
        setIsConnected(true);
      } else {
        setError('Invalid Dropbox access token.');
      }
    } catch (e) {
      setError('Error validating token.');
    }
    setIsSyncing(false);
  };

  const handleDisconnect = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken('');
    setIsConnected(false);
    setError(null);
  };

  const syncData = async () => {
    if (!isConnected || !token) return;
    setError(null);
    setIsSyncing(true);
    try {
      await syncWithDropbox(token);
      
      const now = new Date().toLocaleString();
      setLastSync(now);
      localStorage.setItem('last_sync_time', now);
      
      // Reload page to reflect new data
      window.location.reload();
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Error syncing data with Dropbox.');
    }
    setIsSyncing(false);
  };

  return (
    <div className="okr-container">
      <div className="okr-header">
        <h1 className="okr-title">Cloud Sync</h1>
      </div>

      <div className="okr-card" style={{ marginBottom: '2rem', background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
        <h2 style={{ marginBottom: '1rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '1.3rem' }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-blue)' }}><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>
          True Local-First Experience
        </h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6', marginBottom: '1rem' }}>
          myOKR is built as an industry-standard <strong>"Local-First"</strong> application. This means all your data lives directly on your device first, ensuring lightning-fast performance, maximum privacy, and complete offline availability.
        </p>
        <p style={{ color: 'var(--text-secondary)', lineHeight: '1.6' }}>
          By securely connecting your Dropbox, your data effortlessly syncs across all your devices in the background. We leverage cutting-edge <strong>Automerge CRDTs</strong> (Conflict-free Replicated Data Types) to automatically resolve any edit conflicts mathematically, so you never lose your work—even if you edit offline on multiple devices simultaneously!
        </p>
      </div>

      <div className="okr-card">
        {error && <div style={{ color: 'var(--accent-red)', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>}
        
        {!isConnected ? (
          <div className="sync-setup">
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Connect to Dropbox</h3>
            
            <div className="setup-steps" style={{ marginBottom: '2rem' }}>
              <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>How to get a Dropbox access token:</h4>
              <ol style={{ color: 'var(--text-secondary)', paddingLeft: '1.5rem', lineHeight: '1.8', margin: 0 }}>
                <li>Go to the <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 500 }}>Dropbox App Console</a> and sign in.</li>
                <li>Click <strong>Create app</strong>. Choose "Scoped access" and "App folder". Name your app (e.g., "myOKR Sync").</li>
                <li>Go to the <strong>Permissions</strong> tab, check the boxes for <code>files.content.read</code> and <code>files.content.write</code>, then click <strong>Submit</strong>.</li>
                <li>Go back to the <strong>Settings</strong> tab and scroll down to the "OAuth 2" section.</li>
                <li>Change "Access token expiration" to <strong>No expiration</strong>.</li>
                <li>Click the <strong>Generate</strong> button under "Generated access token", and paste the resulting token below.</li>
              </ol>
            </div>

            <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="Paste your Dropbox access token here (sl.xyz...)"
                className="okr-input"
                style={{ flex: '1 1 300px', padding: '0.8rem 1rem', fontSize: '1rem' }}
              />
              <button className="okr-btn primary" onClick={handleConnect} disabled={isSyncing} style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', whiteSpace: 'nowrap' }}>
                {isSyncing ? 'Connecting...' : 'Connect Dropbox'}
              </button>
            </div>
          </div>
        ) : (
          <div className="sync-status">
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '2rem' }}>
              <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(34, 197, 94, 0.1)', color: '#22c55e', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>
              </div>
              <div>
                <h3 style={{ color: 'var(--text-primary)', margin: '0 0 0.25rem 0' }}>Dropbox Connected</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', margin: 0 }}>
                  {lastSync ? `Last successful sync: ${lastSync}` : 'Your app is ready to sync.'}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <button className="okr-btn primary" onClick={syncData} disabled={isSyncing} style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: isSyncing ? 'spin 2s linear infinite' : 'none' }}>
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <polyline points="1 20 1 14 7 14"></polyline>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
              <button className="okr-btn danger" onClick={handleDisconnect} disabled={isSyncing} style={{ padding: '0.8rem 1.5rem', fontSize: '1rem' }}>
                Disconnect
              </button>
            </div>
            
            <p style={{ marginTop: '2rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              Auto-sync runs in the background every 5 minutes. The app automatically reloads if new changes arrive.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
