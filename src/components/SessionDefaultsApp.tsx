import { useState, Fragment } from 'react';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { DEFAULT_SETTINGS, type PomodoroSettings } from '../lib/pomodoro-storage';
import { getDailyPomodoroBudget } from '../lib/today-focus';
import { useHoldRepeat } from '../hooks/useHoldRepeat';
import { useSession } from './session/SessionProvider';
import NumberInput from './NumberInput';
import AmbientPresetPicker from './shared/AmbientPresetPicker';
import ConfirmModal from './ConfirmModal';
import LoadingState from './shared/LoadingState';

export function formatMinutesSpan(totalMinutes: number): string {
  const safe = Math.max(0, Math.round(totalMinutes));
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

function isDefaultSettings(s: PomodoroSettings): boolean {
  return (
    s.focusDuration === DEFAULT_SETTINGS.focusDuration &&
    s.shortBreakDuration === DEFAULT_SETTINGS.shortBreakDuration &&
    s.longBreakDuration === DEFAULT_SETTINGS.longBreakDuration &&
    s.pomosBeforeLongBreak === DEFAULT_SETTINGS.pomosBeforeLongBreak &&
    s.autoStartBreaks === DEFAULT_SETTINGS.autoStartBreaks &&
    s.autoStartFocus === DEFAULT_SETTINGS.autoStartFocus &&
    s.ambientPreset === DEFAULT_SETTINGS.ambientPreset
  );
}

interface DurationStepperFieldProps {
  label: string;
  hint: string;
  value: number;
  min: number;
  max: number;
  onChange: (val: number) => void;
}

function DurationStepperField({
  label,
  hint,
  value,
  min,
  max,
  onChange,
}: DurationStepperFieldProps) {
  const decHandlers = useHoldRepeat(
    () => onChange(Math.max(min, value - 1)),
    () => value > min,
  );
  const incHandlers = useHoldRepeat(
    () => onChange(Math.min(max, value + 1)),
    () => value < max,
  );

  return (
    <div className="setting-item settings-duration-field">
      <div className="settings-field-head">
        <label className="setting-label">{label}</label>
        <span className="settings-field-hint">{hint}</span>
      </div>
      <div className="settings-stepper">
        <button
          type="button"
          className="settings-stepper-btn"
          aria-label={`Decrease ${label}`}
          disabled={value <= min}
          {...decHandlers}
        >
          <Minus size={14} />
        </button>
        <NumberInput
          className="setting-input settings-stepper-input"
          min={min}
          max={max}
          value={value}
          onChange={(val: number) => onChange(Math.max(min, Math.min(max, val)))}
        />
        <button
          type="button"
          className="settings-stepper-btn"
          aria-label={`Increase ${label}`}
          disabled={value >= max}
          {...incHandlers}
        >
          <Plus size={14} />
        </button>
      </div>
    </div>
  );
}

export default function SessionDefaultsApp() {
  const { settings, updateSetting, resetSettings, isLoading } = useSession();
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  if (isLoading) {
    return <LoadingState className="settings-loading-state" />;
  }

  const dailyBudget = getDailyPomodoroBudget(settings);
  const dailyCapacityMinutes = dailyBudget * settings.focusDuration;
  const shortBreaksPerSet = Math.max(0, settings.pomosBeforeLongBreak - 1);
  const fullSetMinutes =
    settings.pomosBeforeLongBreak * settings.focusDuration +
    shortBreaksPerSet * settings.shortBreakDuration +
    settings.longBreakDuration;
  const atDefaults = isDefaultSettings(settings);
  const compactCadence = settings.pomosBeforeLongBreak > 5;

  return (
    <div className="settings-grid-body">
      <div className="settings-col-main">
        {/* Card 1 — Timer durations & cadence */}
        <section className="settings-panel-card" aria-labelledby="settings-durations-heading">
          <div className="panel-header-row">
            <h3 id="settings-durations-heading" className="panel-eyebrow">
              TIMER DURATIONS &amp; CADENCE
            </h3>
            <span className="settings-autosave-hint">Changes apply immediately</span>
          </div>

          <div className="settings-duration-grid">
            <DurationStepperField
              label="Pomodoro Duration"
              hint="1–120 min"
              min={1}
              max={120}
              value={settings.focusDuration}
              onChange={(val) => updateSetting('focusDuration', val)}
            />
            <DurationStepperField
              label="Short Break"
              hint="1–30 min"
              min={1}
              max={30}
              value={settings.shortBreakDuration}
              onChange={(val) => updateSetting('shortBreakDuration', val)}
            />
            <DurationStepperField
              label="Long Break"
              hint="1–60 min"
              min={1}
              max={60}
              value={settings.longBreakDuration}
              onChange={(val) => updateSetting('longBreakDuration', val)}
            />
            <DurationStepperField
              label="Pomos before long break"
              hint="1–10 sets"
              min={1}
              max={10}
              value={settings.pomosBeforeLongBreak}
              onChange={(val) => updateSetting('pomosBeforeLongBreak', val)}
            />
          </div>
        </section>

        {/* Card 2 — Transitions & ambient sound */}
        <section className="settings-panel-card" aria-labelledby="settings-transitions-heading">
          <div className="panel-header-row">
            <h3 id="settings-transitions-heading" className="panel-eyebrow">
              TRANSITIONS &amp; AMBIENT SOUND
            </h3>
          </div>

          <div className="settings-switch-list">
            <div className="settings-switch-row">
              <div className="settings-switch-copy">
                <span className="settings-row-title">Auto-start breaks</span>
                <span className="settings-row-desc">
                  Start the break timer automatically when a focus session finishes.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.autoStartBreaks}
                aria-label="Auto-start breaks"
                className={`toggle-switch${settings.autoStartBreaks ? ' on' : ''}`}
                onClick={() => updateSetting('autoStartBreaks', !settings.autoStartBreaks)}
              />
            </div>

            <div className="settings-switch-row">
              <div className="settings-switch-copy">
                <span className="settings-row-title">Auto-start focus</span>
                <span className="settings-row-desc">
                  Start the next focus session automatically when a break ends.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={settings.autoStartFocus}
                aria-label="Auto-start focus"
                className={`toggle-switch${settings.autoStartFocus ? ' on' : ''}`}
                onClick={() => updateSetting('autoStartFocus', !settings.autoStartFocus)}
              />
            </div>
          </div>

          <div className="settings-ambient-block">
            <AmbientPresetPicker
              value={settings.ambientPreset}
              onChange={(p) => updateSetting('ambientPreset', p)}
            />
            <p className="settings-ambient-caption">
              Procedural Web Audio soundscapes play automatically while a focus session is running.
            </p>
          </div>
        </section>
      </div>

      {/* Right Rail — Daily rhythm & Reset */}
      <aside className="settings-col-rail" aria-label="Session impact summary">
        <section className="settings-panel-card settings-rhythm-card" aria-labelledby="settings-rhythm-heading">
          <div className="panel-header-row">
            <h3 id="settings-rhythm-heading" className="panel-eyebrow">
              DAILY RHYTHM
            </h3>
          </div>

          <div className="settings-rhythm-stat">
            <span className="settings-rhythm-label">Daily focus budget</span>
            <div className="settings-rhythm-value-row">
              <span className="settings-rhythm-number">{dailyBudget}</span>
              <span className="settings-rhythm-unit">
                {dailyBudget === 1 ? 'pomodoro / day' : 'pomodoros / day'}
              </span>
            </div>
            <p className="settings-rhythm-note">
              {formatMinutesSpan(dailyCapacityMinutes)} target capacity used by Day plan and Focus analytics.
            </p>
          </div>

          <div className="settings-rhythm-divider" />

          <div className="settings-rhythm-stat">
            <div className="settings-rhythm-head-inline">
              <span className="settings-rhythm-label">Full set cadence</span>
              <span className="settings-rhythm-total">{formatMinutesSpan(fullSetMinutes)}</span>
            </div>

            <div className="settings-cadence-strip" aria-label="Session cadence preview">
              {compactCadence ? (
                <>
                  <span className="settings-cadence-pill focus">
                    {settings.pomosBeforeLongBreak} × {settings.focusDuration}m focus
                  </span>
                  <span className="settings-cadence-pill break">
                    {shortBreaksPerSet} × {settings.shortBreakDuration}m short
                  </span>
                  <span className="settings-cadence-pill long-break">
                    {settings.longBreakDuration}m long break
                  </span>
                </>
              ) : (
                <>
                  {Array.from({ length: settings.pomosBeforeLongBreak }, (_, idx) => (
                    <Fragment key={idx}>
                      <span className="settings-cadence-pill focus">{settings.focusDuration}m</span>
                      {idx < settings.pomosBeforeLongBreak - 1 && (
                        <span className="settings-cadence-pill break">{settings.shortBreakDuration}m</span>
                      )}
                    </Fragment>
                  ))}
                  <span className="settings-cadence-pill long-break">
                    {settings.longBreakDuration}m long
                  </span>
                </>
              )}
            </div>

            <p className="settings-rhythm-note">
              {settings.pomosBeforeLongBreak} focus {settings.pomosBeforeLongBreak === 1 ? 'session' : 'sessions'}
              {shortBreaksPerSet > 0 ? ` · ${shortBreaksPerSet} short ${shortBreaksPerSet === 1 ? 'break' : 'breaks'}` : ''}
              {' · '}1 long break per cycle.
            </p>
          </div>

          <div className="settings-rhythm-footer">
            <button
              type="button"
              className="settings-reset-btn"
              disabled={atDefaults}
              onClick={() => setShowResetConfirm(true)}
            >
              <RotateCcw size={14} />
              <span>Reset to defaults</span>
            </button>
          </div>
        </section>
      </aside>

      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={resetSettings}
        title="Reset session defaults?"
        message="Restore 25m focus, 5m short break, 15m long break, 4 pomodoros before long break, auto-start transitions on, and ambient sound off?"
        confirmText="Reset defaults"
        danger={false}
      />
    </div>
  );
}
