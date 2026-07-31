import { useState, useEffect, useRef } from 'react';
import { getAutomergeDoc, updateAutomergeDoc } from '../lib/automerge-storage';
import type { PomodoroSettings } from '../lib/pomodoro-storage';
import { DEFAULT_SETTINGS } from '../lib/pomodoro-storage';
import NumberInput from './NumberInput';
import '../styles/app.css';

export default function SessionDefaultsApp() {
  const [settings, setSettings] = useState<PomodoroSettings>(DEFAULT_SETTINGS);
  const [loading, setLoading] = useState(true);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    getAutomergeDoc().then(doc => {
      if (doc?.settings) {
        setSettings({ ...DEFAULT_SETTINGS, ...doc.settings });
      }
      setLoading(false);
    }).catch(err => {
      console.error('Failed to load settings:', err);
      setLoading(false);
    });
  }, []);

  const updateSetting = <K extends keyof PomodoroSettings>(key: K, value: PomodoroSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      updateAutomergeDoc('update setting', (doc) => {
        if (!doc.settings) doc.settings = { ...DEFAULT_SETTINGS };
        doc.settings[key] = value;
      }).catch(err => console.error(`Failed to update setting ${key}:`, err));
    }, 300);
  };

  if (loading) {
    return (
      <div className="page-shell settings-loading">
        Loading session defaults...
      </div>
    );
  }

  return (
    <div className="page-shell">
      <div className="settings-wrapper">
        <h2 className="settings-title">Session Defaults</h2>
        <p className="settings-desc">
          Configure timer durations, break behavior, and session preferences.
        </p>

        <div className="settings-card">
          <div className="settings-grid">
            <div className="setting-item">
              <label className="setting-label">Pomodoro Duration (min)</label>
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

          <div className="settings-toggles">
            <div className="toggle-row">
              <span className="setting-label">Auto-start breaks</span>
              <button
                className={`toggle-switch${settings.autoStartBreaks ? ' on' : ''}`}
                onClick={() => updateSetting('autoStartBreaks', !settings.autoStartBreaks)}
                type="button"
                aria-label="Auto-start breaks"
              />
            </div>
            <div className="toggle-row">
              <span className="setting-label">Auto-start focus</span>
              <button
                className={`toggle-switch${settings.autoStartFocus ? ' on' : ''}`}
                onClick={() => updateSetting('autoStartFocus', !settings.autoStartFocus)}
                type="button"
                aria-label="Auto-start focus"
              />
            </div>
            <div className="toggle-row">
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
