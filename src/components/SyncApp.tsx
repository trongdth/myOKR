import { useState, useEffect, type KeyboardEvent } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Check,
  ChevronRight,
  ExternalLink,
  HardDrive,
  KeyRound,
  RefreshCw,
} from 'lucide-react';
import {
  validateDropboxToken,
  syncWithDropbox,
  getDropboxAuthUrl,
  exchangeDropboxCode,
  parseAuthResponse,
} from '../lib/dropbox-service';
import {
  DROPBOX_KEYS,
  loadCredentials,
  saveCredentials,
  clearCredentials,
} from '../lib/credential-store';
import { tauriCredentialStore } from '../lib/tauri-credential-adapter';
import ConfirmModal from './ConfirmModal';

const CLIENT_ID_KEY = 'dropbox_client_id';
const REFRESH_TOKEN_KEY = 'dropbox_refresh_token';

function isImeComposing(e: KeyboardEvent<HTMLInputElement>): boolean {
  return e.nativeEvent.isComposing || e.keyCode === 229;
}

export default function SyncApp() {
  const [clientId, setClientId] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [authUrl, setAuthUrl] = useState('');
  const [codeVerifier, setCodeVerifier] = useState('');
  const [oauthState, setOAuthState] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showDisconnectConfirm, setShowDisconnectConfirm] = useState(false);
  const [showOverwriteConfirm, setShowOverwriteConfirm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const creds = await loadCredentials(tauriCredentialStore, DROPBOX_KEYS);
      if (cancelled) return;
      if (creds[CLIENT_ID_KEY] && creds[REFRESH_TOKEN_KEY]) {
        setIsConnected(true);
      }
      try {
        const last = localStorage.getItem('last_sync_time');
        if (last) setLastSync(last);
      } catch {
        // Ignore storage read errors in restricted modes
      }
    })();

    const refreshLastSync = () => {
      try {
        const last = localStorage.getItem('last_sync_time');
        if (last) setLastSync(last);
      } catch {
        // Ignore storage read errors
      }
    };
    window.addEventListener('myokr-data-synced', refreshLastSync);
    return () => {
      cancelled = true;
      window.removeEventListener('myokr-data-synced', refreshLastSync);
    };
  }, []);

  const handleGetLink = async () => {
    if (!clientId.trim()) {
      setError('Please enter your Dropbox App Key first.');
      return;
    }
    setError(null);
    try {
      const { url, codeVerifier: verifier, state } = await getDropboxAuthUrl(clientId.trim());
      setAuthUrl(url);
      setCodeVerifier(verifier);
      setOAuthState(state);
    } catch {
      setError('Failed to generate authorization URL. Check your App Key.');
    }
  };

  /** Unlocks Step 1 if the user entered the wrong App Key or wants to restart OAuth. */
  const handleResetAuthStep = () => {
    setAuthUrl('');
    setAuthCode('');
    setCodeVerifier('');
    setOAuthState('');
    setError(null);
  };

  const handleConnect = async () => {
    if (!clientId.trim() || !authCode.trim() || !codeVerifier || !oauthState) {
      setError('Please complete the authorization step.');
      return;
    }
    const parsed = parseAuthResponse(authCode);
    if (parsed.code === '' || parsed.state == null) {
      setError('Please paste the full authorization URL (it carries the state).');
      return;
    }
    setError(null);
    setIsSyncing(true);
    try {
      const refreshToken = await exchangeDropboxCode(clientId.trim(), parsed.code, codeVerifier, {
        expectedState: oauthState,
        returnedState: parsed.state,
      });
      if (refreshToken) {
        const valid = await validateDropboxToken(clientId.trim(), refreshToken);
        if (valid) {
          await saveCredentials(tauriCredentialStore, {
            [CLIENT_ID_KEY]: clientId.trim(),
            [REFRESH_TOKEN_KEY]: refreshToken,
          });
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
      setError('Error validating authorization code. Make sure you copied the entire redirect URL.');
    }
    setIsSyncing(false);
  };

  const performDisconnect = () => {
    void clearCredentials(tauriCredentialStore, DROPBOX_KEYS).catch(console.error);
    setIsConnected(false);
    setClientId('');
    setAuthCode('');
    setAuthUrl('');
    setCodeVerifier('');
    setOAuthState('');
    setError(null);
    window.dispatchEvent(new CustomEvent('myokr-sync-status-changed'));
  };

  const syncData = async (forceUpload: boolean = false) => {
    const creds = await loadCredentials(tauriCredentialStore, DROPBOX_KEYS);
    if (!isConnected || !creds.dropbox_client_id || !creds.dropbox_refresh_token) return;

    setError(null);
    setIsSyncing(true);
    try {
      await syncWithDropbox(creds.dropbox_client_id, creds.dropbox_refresh_token, forceUpload);

      const now = new Date().toLocaleString();
      setLastSync(now);
      try {
        localStorage.setItem('last_sync_time', now);
      } catch {
        // Non-fatal pref write (rule 8)
      }

      window.dispatchEvent(new CustomEvent('myokr-data-synced'));
    } catch (e: unknown) {
      console.error(e);
      const err = e as { status?: number; message?: string };
      if (err?.status === 401) {
        performDisconnect();
        setError('Dropbox connection is invalid or expired. Please reconnect.');
      } else {
        setError(err?.message || 'Error syncing data with Dropbox.');
      }
    }
    setIsSyncing(false);
  };

  const canOverwriteCloud = !!error && error.includes('corrupted or invalid');

  return (
    <div className="settings-grid-body">
      <div className="settings-col-main">
        {error && (
          <div className="settings-error-banner" role="alert">
            <AlertCircle size={16} className="settings-error-icon" />
            <span>{error}</span>
          </div>
        )}

        {!isConnected ? (
          <section className="settings-panel-card" aria-labelledby="settings-sync-setup-heading">
            <div className="panel-header-row">
              <h3 id="settings-sync-setup-heading" className="panel-eyebrow">
                DROPBOX CLOUD SYNC
              </h3>
              <span className="settings-status-pill muted">Not connected</span>
            </div>

            <p className="settings-card-intro">
              Connect your own Dropbox app to back up and merge your OKRs, tasks, habits, and weekly reviews across devices.
            </p>

            {/* Step 1 — App Key */}
            <div className="settings-sync-step">
              <div className="settings-step-header">
                <span className="settings-step-label">STEP 1 · APP KEY</span>
                {authUrl && (
                  <button
                    type="button"
                    className="settings-change-key-btn"
                    onClick={handleResetAuthStep}
                  >
                    Change key
                  </button>
                )}
              </div>

              <div className="settings-input-action-row">
                <input
                  type="text"
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !isImeComposing(e) && !authUrl) {
                      e.preventDefault();
                      void handleGetLink();
                    }
                  }}
                  placeholder="Paste your Dropbox App Key"
                  aria-label="Dropbox App Key"
                  className="settings-text-input"
                  disabled={!!authUrl}
                />
                {!authUrl && (
                  <button
                    type="button"
                    className="btn settings-primary-btn"
                    onClick={() => void handleGetLink()}
                  >
                    <span>Get authorization link</span>
                    <ArrowRight size={15} />
                  </button>
                )}
              </div>
            </div>

            {/* Step 2 — Authorize & Verify */}
            {authUrl && (
              <div className="settings-sync-step settings-sync-step-box">
                <div className="settings-step-header">
                  <span className="settings-step-label">STEP 2 · AUTHORIZE &amp; VERIFY</span>
                </div>
                <p className="settings-step-desc">
                  Open the authorization page in your browser, approve access, then paste the full redirect URL below.
                </p>

                <div className="settings-auth-link-row">
                  <a
                    href={authUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="settings-ghost-link-btn"
                  >
                    <span>Open authorization page</span>
                    <ExternalLink size={14} />
                  </a>
                </div>

                <div className="settings-input-action-row">
                  <input
                    type="password"
                    value={authCode}
                    onChange={(e) => setAuthCode(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !isImeComposing(e) && authCode.trim() && !isSyncing) {
                        e.preventDefault();
                        void handleConnect();
                      }
                    }}
                    placeholder="Paste the full redirect URL here"
                    aria-label="Dropbox redirect URL"
                    className="settings-text-input"
                  />
                  <button
                    type="button"
                    className="btn settings-primary-btn"
                    onClick={() => void handleConnect()}
                    disabled={isSyncing || !authCode.trim()}
                  >
                    {isSyncing ? 'Connecting…' : 'Connect'}
                  </button>
                </div>
              </div>
            )}

            {/* Collapsible 5-step Dropbox App Console guide */}
            <details className="settings-disclosure">
              <summary className="settings-disclosure-summary">
                <ChevronRight size={14} className="settings-disclosure-chevron" aria-hidden="true" />
                <span>How to create a Dropbox App Key (5 steps)</span>
              </summary>
              <div className="settings-disclosure-body">
                <ol className="settings-setup-steps">
                  <li>
                    Open the{' '}
                    <a
                      href="https://www.dropbox.com/developers/apps"
                      target="_blank"
                      rel="noreferrer"
                      className="settings-inline-link"
                    >
                      Dropbox App Console <ExternalLink size={12} className="icon-inline" />
                    </a>{' '}
                    and sign in.
                  </li>
                  <li>
                    Click <strong>Create app</strong>, choose <strong>Scoped access</strong> and{' '}
                    <strong>App folder</strong>, then name your app (for example, <code>myOKR Sync</code>).
                  </li>
                  <li>
                    Open the <strong>Permissions</strong> tab, enable{' '}
                    <code>files.content.read</code> and <code>files.content.write</code>, and click{' '}
                    <strong>Submit</strong>.
                  </li>
                  <li>
                    Return to the <strong>Settings</strong> tab and copy your <strong>App key</strong>.
                  </li>
                  <li>
                    Paste the App key into Step 1 above and click <strong>Get authorization link</strong>.
                  </li>
                </ol>
              </div>
            </details>
          </section>
        ) : (
          <section className="settings-panel-card" aria-labelledby="settings-sync-connected-heading">
            <div className="panel-header-row">
              <h3 id="settings-sync-connected-heading" className="panel-eyebrow">
                SYNC CONNECTION
              </h3>
              <span className="settings-status-pill connected">Active</span>
            </div>

            <div className="settings-connected-hero">
              <div className="settings-connected-badge" aria-hidden="true">
                <Check size={20} strokeWidth={2.5} />
              </div>
              <div className="settings-connected-copy">
                <p className="settings-connected-title">Dropbox connected</p>
                <p className="settings-connected-meta">
                  {lastSync ? (
                    <>
                      Last synced <span className="settings-mono-inline">{lastSync}</span>
                    </>
                  ) : (
                    'Ready to run your first sync.'
                  )}
                </p>
              </div>
            </div>

            <div className="settings-sync-actions">
              <button
                type="button"
                className="btn settings-primary-btn"
                onClick={() => void syncData(false)}
                disabled={isSyncing}
              >
                <RefreshCw size={15} className={isSyncing ? 'settings-spin' : undefined} />
                <span>{isSyncing ? 'Syncing…' : 'Sync now'}</span>
              </button>

              {canOverwriteCloud && (
                <button
                  type="button"
                  className="settings-danger-outline-btn"
                  onClick={() => setShowOverwriteConfirm(true)}
                  disabled={isSyncing}
                >
                  {isSyncing ? 'Overwriting…' : 'Overwrite cloud data'}
                </button>
              )}

              <button
                type="button"
                className="settings-disconnect-btn"
                onClick={() => setShowDisconnectConfirm(true)}
                disabled={isSyncing}
              >
                Disconnect
              </button>
            </div>
          </section>
        )}
      </div>

      {/* Right Rail — Local-first architecture */}
      <aside className="settings-col-rail" aria-label="Local-first sync architecture">
        <section className="settings-panel-card" aria-labelledby="settings-local-arch-heading">
          <div className="panel-header-row">
            <h3 id="settings-local-arch-heading" className="panel-eyebrow">
              LOCAL-FIRST ARCHITECTURE
            </h3>
          </div>

          <div className="settings-arch-list">
            <div className="settings-arch-item">
              <div className="settings-arch-icon" aria-hidden="true">
                <HardDrive size={16} />
              </div>
              <div className="settings-arch-copy">
                <span className="settings-row-title">Automerge CRDT storage</span>
                <span className="settings-row-desc">
                  All data lives locally in <code className="settings-code-chip">myokr-data.automerge</code> for instant offline speed and conflict-free merges.
                </span>
              </div>
            </div>

            <div className="settings-arch-item">
              <div className="settings-arch-icon" aria-hidden="true">
                <KeyRound size={16} />
              </div>
              <div className="settings-arch-copy">
                <span className="settings-row-title">OS Keychain credentials</span>
                <span className="settings-row-desc">
                  Dropbox OAuth tokens stay encrypted in your system keychain and are never written into the synced document.
                </span>
              </div>
            </div>

            <div className="settings-arch-item">
              <div className="settings-arch-icon" aria-hidden="true">
                <RefreshCw size={16} />
              </div>
              <div className="settings-arch-copy">
                <span className="settings-row-title">15-minute background sync</span>
                <span className="settings-row-desc">
                  When connected, changes sync automatically 5 seconds after launch and every 15 minutes in the background.
                </span>
              </div>
            </div>
          </div>
        </section>
      </aside>

      <ConfirmModal
        isOpen={showDisconnectConfirm}
        onClose={() => setShowDisconnectConfirm(false)}
        onConfirm={performDisconnect}
        title="Disconnect Dropbox?"
        message="Stop background cloud sync and remove saved Dropbox credentials from this device? Your local tasks, objectives, habits, and reviews remain intact on this computer."
        confirmText="Disconnect"
        danger={true}
      />

      <ConfirmModal
        isOpen={showOverwriteConfirm}
        onClose={() => setShowOverwriteConfirm(false)}
        onConfirm={() => void syncData(true)}
        title="Overwrite cloud data?"
        message="Replace the corrupted Dropbox file with this device's local database? Use this only if this computer holds your latest good data."
        confirmText="Overwrite cloud"
        danger={true}
      />
    </div>
  );
}
