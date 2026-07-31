import { useState, useEffect } from 'react';
import { getAutomergeDoc, updateAutomergeDoc } from '../lib/automerge-storage';
import type { PomodoroSettings } from '../lib/pomodoro-storage';
import { DEFAULT_SETTINGS } from '../lib/pomodoro-storage';
import NumberInput from './NumberInput';
import '../styles/app.css';

export default function SessionDefaultsApp() {
  const [settings, setSettings] = useState<PomodoroSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAutomergeDoc().then(doc => {
      if (doc?.settings) {
        setSettings({
          focusDuration: doc.settings.focusDuration ?? DEFAULT_SETTINGS.focusDuration,
          shortBreakDuration: doc.settings.shortBreakDuration ?? DEFAULT_SETTINGS.shortBreakDuration,
          longBreakDuration: doc.settings.longBreakDuration ?? DEFAULT_SETTINGS.longBreakDuration,
          pomosBeforeLongBreak: doc.settings.pomosBeforeLongBreak ?? DEFAULT_SETTINGS.pomosBeforeLongBreak,
          autoStartBreaks: doc.settings.autoStartBreaks ?? DEFAULT_SETTINGS.autoStartBreaks,
          autoStartFocus: doc.settings.autoStartFocus ?? DEFAULT_SETTINGS.autoStartFocus,
          focusMusicEnabled: doc.settings.focusMusicEnabled ?? DEFAULT_SETTINGS.focusMusicEnabled,
        });
      }
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load settings:', err);
      setLoading(false);
    });
  }, []);

  const updateSetting = <K extends keyof PomodoroSettings>(key: K, value: PomodoroSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    updateAutomergeDoc('update setting', (doc: any) => {
      if (!doc.settings) doc.settings = { ...DEFAULT_SETTINGS };
      doc.settings[key] = value;
    }).catch(err => console.error(`Failed to update setting ${key}:`, err));
  };

  if (loading) {
    return (
      <div className="page-shell" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '300px', color: 'var(--text-secondary)' }}>
        Loading session defaults...
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '32px 0' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '8px' }}>
          Session Defaults
        </h2>
        <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)', marginBottom: '24px' }}>
          Configure timer durations, break behavior, and session preferences.
        </p>

        <div className="settings-panel" style={{ display: 'block', background: 'var(--bg-secondary)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '12px', padding: '24px' }}>
          <div className="settings-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px', marginBottom: '24px' }}>
            <div className="setting-item">
              <label className="setting-label">Focus (min)</label>
              <NumberInput
                className="setting-input"
                min={1}
                max={120}
                value={settings.focusDuration}
                onChange={(val: number) => updateSetting('focusDuration', Math.max(1, Math.min(120, val)))}
              />
            </div>
            <div className="setting-item">
              <label className="setting-label">Short Break (min)</label>
              <NumberInput
                className="setting-input"
                min={1}
                max={30}
                value={settings.shortBreakDuration}
                onChange={(val: number) => updateSetting('shortBreakDuration', Math.max(1, Math.min(30, val)))}
              />
            </div>
            <div className="setting-item">
              <label className="setting-label">Long Break (min)</label>
              <NumberInput
                className="setting-input"
                min={1}
                max={60}
                value={settings.longBreakDuration}
                onChange={(val: number) => updateSetting('longBreakDuration', Math.max(1, Math.min(60, val)))}
              />
            </div>
            <div className="setting-item">
              <label className="setting-label">Pomos before long break</label>
              <NumberInput
                className="setting-input"
                min={1}
                max={10}
                value={settings.pomosBeforeLongBreak}
                onChange={(val: number) => updateSetting('pomosBeforeLongBreak', Math.max(1, Math.min(10, val)))}
              />
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: '20px' }}>
            <div className="toggle-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="setting-label">Auto-start breaks</span>
              <button
                className={`toggle-switch${settings.autoStartBreaks ? ' on' : ''}`}
                onClick={() => updateSetting('autoStartBreaks', !settings.autoStartBreaks)}
                type="button"
                aria-label="Auto-start breaks"
              />
            </div>
            <div className="toggle-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="setting-label">Auto-start focus</span>
              <button
                className={`toggle-switch${settings.autoStartFocus ? ' on' : ''}`}
                onClick={() => updateSetting('autoStartFocus', !settings.autoStartFocus)}
                type="button"
                aria-label="Auto-start focus"
              />
            </div>
            <div className="toggle-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span className="setting-label">Enable Focus Music</span>
              <button
                className={`toggle-switch${settings.focusMusicEnabled ? ' on' : ''}`}
                onClick={() => updateSetting('focusMusicEnabled', !settings.focusMusicEnabled)}
                type="button"
                aria-label="Enable Focus Music"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
