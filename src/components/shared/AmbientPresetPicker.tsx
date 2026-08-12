import { AMBIENT_PRESETS, type AmbientPreset } from '../../lib/pomodoro-storage';
import { AMBIENT_PRESET_LABELS } from '../../lib/focus-music';

/**
 * The ambient-sound preset picker (ADR-0015). A row of segmented chips —
 * None / Rain / Forest / Café — that replaces the legacy Focus-music toggle.
 * Shared between the Session tab's settings panel and the SessionDefaults
 * screen so the two stay in sync. Reads and writes through the
 * `value` / `onChange` pair the settings panels already use.
 */
export default function AmbientPresetPicker({
  value,
  onChange,
}: {
  value: AmbientPreset;
  onChange: (preset: AmbientPreset) => void;
}) {
  return (
    <div className="ambient-picker-row">
      <span className="setting-label">Ambient sound</span>
      <div className="ambient-picker" role="radiogroup" aria-label="Ambient sound">
        {AMBIENT_PRESETS.map(p => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={value === p}
            className={`ambient-chip${value === p ? ' active' : ''}`}
            onClick={() => onChange(p)}
          >
            {AMBIENT_PRESET_LABELS[p]}
          </button>
        ))}
      </div>
    </div>
  );
}
