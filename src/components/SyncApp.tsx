import { useState, useEffect } from 'react';
import { validateDropboxToken, syncWithDropbox, getDropboxAuthUrl, exchangeDropboxCode } from '../lib/dropbox-service';
import '../styles/app.css';

const CLIENT_ID_KEY = 'dropbox_client_id';
const REFRESH_TOKEN_KEY = 'dropbox_refresh_token';

export default function SyncApp() {
  const [clientId, setClientId] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [codeVerifier, setCodeVerifier] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const savedClientId = localStorage.getItem(CLIENT_ID_KEY);
    const savedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (savedClientId && savedRefreshToken) {
      setIsConnected(true);
    }
    const last = localStorage.getItem('last_sync_time');
    if (last) setLastSync(last);
  }, []);

  const handleGetLink = async () => {
    if (!clientId.trim()) {
      setError('Please enter your App Key first.');
      return;
    }
    setError(null);
    try {
      const { url, codeVerifier: verifier } = await getDropboxAuthUrl(clientId.trim());
      setAuthUrl(url);
      setCodeVerifier(verifier);
    } catch (e) {
      setError('Failed to generate authorization URL. Check your App Key.');
    }
  };

  const handleConnect = async () => {
    if (!clientId.trim() || !authCode.trim() || !codeVerifier) {
      setError('Please complete the authorization step.');
      return;
    }
    setError(null);
    setIsSyncing(true);
    try {
      const refreshToken = await exchangeDropboxCode(clientId.trim(), authCode.trim(), codeVerifier);
      if (refreshToken) {
        const valid = await validateDropboxToken(clientId.trim(), refreshToken);
        if (valid) {
          localStorage.setItem(CLIENT_ID_KEY, clientId.trim());
          localStorage.setItem(REFRESH_TOKEN_KEY, refreshToken);
          setIsConnected(true);
          window.dispatchEvent(new CustomEvent('myokr-sync-status-changed'));
        } else {
          setError('Failed to validate the connection. Please try again.');
        }
      } else {
        setError('Failed to obtain refresh token.');
      }
    } catch (e) {
      console.error(e);
      setError('Error validating authorization code. Make sure you copied the entire code.');
    }
    setIsSyncing(false);
  };

  const handleDisconnect = () => {
    localStorage.removeItem(CLIENT_ID_KEY);
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    setIsConnected(false);
    setClientId('');
    setAuthCode('');
    setAuthUrl('');
    setCodeVerifier('');
    setError(null);
    window.dispatchEvent(new CustomEvent('myokr-sync-status-changed'));
  };

  const syncData = async (forceUpload: boolean = false) => {
    const savedClientId = localStorage.getItem(CLIENT_ID_KEY);
    const savedRefreshToken = localStorage.getItem(REFRESH_TOKEN_KEY);
    if (!isConnected || !savedClientId || !savedRefreshToken) return;
    
    setError(null);
    setIsSyncing(true);
    try {
      await syncWithDropbox(savedClientId, savedRefreshToken, forceUpload);
      
      const now = new Date().toLocaleString();
      setLastSync(now);
      localStorage.setItem('last_sync_time', now);
      
      // Notify other components to refresh data without a full page reload
      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    } catch (e: any) {
      console.error(e);
      if (e?.status === 401) {
        handleDisconnect();
        setError('Dropbox connection is invalid or expired. Please reconnect.');
      } else {
        setError(e.message || 'Error syncing data with Dropbox.');
      }
    }
    setIsSyncing(false);
  };

  return (
    <div className="okr-container">
      <div className="okr-header">
        <h2 className="okr-header-title" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent-blue)' }}>
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="17 8 12 3 7 8" />
            <line x1="12" y1="3" x2="12" y2="15" />
          </svg>
          Cloud Sync
        </h2>
      </div>

      <div className="okr-card" style={{ marginBottom: '2rem', background: 'var(--bg-secondary)', border: 'none', padding: '1.25rem 1.5rem' }}>
        <h2 style={{ marginBottom: '0.5rem', color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1.1rem' }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: '#eab308' }}><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
          True Local-First Experience
        </h2>
        <p style={{ color: 'var(--text-secondary)', lineHeight: '1.5', margin: 0 }}>
          Enjoy lightning-fast performance and full offline support. Connect Dropbox to seamlessly sync your data across all devices.
        </p>
      </div>

      <div className="okr-card">
        {error && <div style={{ color: 'var(--accent-red)', marginBottom: '1.5rem', padding: '1rem', background: 'rgba(239, 68, 68, 0.1)', borderRadius: '8px', border: '1px solid rgba(239, 68, 68, 0.2)' }}>{error}</div>}
        
        {!isConnected ? (
          <div className="sync-setup">
            <h3 style={{ marginBottom: '1.5rem', color: 'var(--text-primary)' }}>Connect to Dropbox</h3>
            
            <div className="setup-steps" style={{ marginBottom: '2rem' }}>
              <h4 style={{ marginBottom: '1rem', color: 'var(--text-primary)' }}>How to connect:</h4>
              <ol style={{ color: 'var(--text-secondary)', paddingLeft: '1.5rem', lineHeight: '1.8', margin: 0 }}>
                <li>Go to the <a href="https://www.dropbox.com/developers/apps" target="_blank" rel="noreferrer" style={{ color: 'var(--accent-blue)', textDecoration: 'none', fontWeight: 500 }}>Dropbox App Console</a> and sign in.</li>
                <li>Click <strong>Create app</strong>. Choose "Scoped access" and "App folder". Name your app (e.g., "myOKR Sync").</li>
                <li>Go to the <strong>Permissions</strong> tab, check the boxes for <code>files.content.read</code> and <code>files.content.write</code>, then click <strong>Submit</strong>.</li>
                <li>Go back to the <strong>Settings</strong> tab and copy your <strong>App key</strong> (Client ID).</li>
                <li>Paste your App Key below and click <strong>Get Authorization Link</strong>.</li>
              </ol>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="Paste your Dropbox App Key here"
                  className="okr-input"
                  disabled={!!authUrl}
                  style={{ flex: '1 1 300px', padding: '0.8rem 1rem', fontSize: '1rem' }}
                />
                {!authUrl && (
                  <button className="okr-btn primary" onClick={handleGetLink} style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', whiteSpace: 'nowrap' }}>
                    Get Authorization Link
                  </button>
                )}
              </div>

              {authUrl && (
                <div style={{ background: 'var(--bg-secondary)', padding: '1.5rem', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ color: 'var(--text-primary)', marginBottom: '1rem' }}>Step 2: Authorize App</h4>
                  <p style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                    Click the link below, authorize the app in the new tab, and copy the provided access code.
                  </p>
                  <a href={authUrl} target="_blank" rel="noreferrer" className="okr-btn" style={{ display: 'inline-block', marginBottom: '1.5rem', textDecoration: 'none', background: 'var(--bg-primary)' }}>
                    Open Authorization Page ↗
                  </a>
                  
                  <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start', flexWrap: 'wrap' }}>
                    <input
                      type="password"
                      value={authCode}
                      onChange={(e) => setAuthCode(e.target.value)}
                      placeholder="Paste the Authorization Code here"
                      className="okr-input"
                      style={{ flex: '1 1 300px', padding: '0.8rem 1rem', fontSize: '1rem' }}
                    />
                    <button className="okr-btn primary" onClick={handleConnect} disabled={isSyncing || !authCode} style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', whiteSpace: 'nowrap' }}>
                      {isSyncing ? 'Connecting...' : 'Connect'}
                    </button>
                  </div>
                </div>
              )}
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
              <button className="okr-btn primary" onClick={() => syncData(false)} disabled={isSyncing} style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ animation: isSyncing ? 'spin 2s linear infinite' : 'none' }}>
                  <polyline points="23 4 23 10 17 10"></polyline>
                  <polyline points="1 20 1 14 7 14"></polyline>
                  <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
                </svg>
                {isSyncing ? 'Syncing...' : 'Sync Now'}
              </button>
              {error && error.includes('corrupted or invalid') && (
                <button className="okr-btn danger" onClick={() => syncData(true)} disabled={isSyncing} style={{ padding: '0.8rem 1.5rem', fontSize: '1rem' }}>
                  {isSyncing ? 'Overwriting...' : 'Overwrite Cloud Data'}
                </button>
              )}
              <button className="okr-btn danger" onClick={handleDisconnect} disabled={isSyncing} style={{ padding: '0.8rem 1.5rem', fontSize: '1rem', background: error && error.includes('corrupted or invalid') ? 'transparent' : undefined, border: error && error.includes('corrupted or invalid') ? '1px solid var(--accent-red)' : undefined, color: error && error.includes('corrupted or invalid') ? 'var(--accent-red)' : undefined }}>
                Disconnect
              </button>
            </div>
            
            <p style={{ marginTop: '2rem', fontSize: '0.9rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 0 }}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>
              Auto-sync runs in the background every 15 minutes. The app automatically updates if new changes arrive.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
