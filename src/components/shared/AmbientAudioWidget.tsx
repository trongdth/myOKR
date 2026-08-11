import { useState, useRef, useEffect } from 'react';
import { Music4, ChevronDown } from 'lucide-react';
import { AMBIENT_PRESETS, type AmbientPreset } from '../../lib/pomodoro-storage';
import { AMBIENT_PRESET_LABELS } from '../../lib/focus-music';

/**
 * Bottom-bar ambient audio status widget (ADR-0015 / ADR-0016, ticket 06).
 * Shows the active preset's display name (or an inviting "Pick a sound" when
 * None) and opens a small dropdown selector listing Rain / Forest / Café /
 * None. Writes through `settings.ambientPreset`; the synth engine in
 * SessionProvider responds in real time.
 *
 * Display names: Rain → "Rain on window"; Forest → "Forest"; Café → "Café";
 * None → "Pick a sound" (inviting off state). The bare labels (AMBIENT_PRESET_LABELS)
 * appear in the dropdown options.
 */
const STATUS_LABEL: Record<AmbientPreset, string> = {
  none: 'Pick a sound',
  rain: 'Rain on window',
  forest: 'Forest',
  cafe: 'Café',
};

export default function AmbientAudioWidget({
  value,
  onChange,
}: {
  value: AmbientPreset;
  onChange: (preset: AmbientPreset) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div className="audio-widget-wrap" ref={ref}>
      <button
        type="button"
        className={`audio-widget${value !== 'none' ? ' active' : ''}`}
        onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Ambient sound: ${STATUS_LABEL[value]}. Click to change.`}
      >
        <Music4 size={14} className="audio-widget-icon" />
        <span className="audio-widget-name">{STATUS_LABEL[value]}</span>
        <ChevronDown size={12} className="audio-widget-chevron" />
      </button>
      {open && (
        <div className="audio-selector" role="listbox" aria-label="Pick ambient sound">
          {AMBIENT_PRESETS.map(p => (
            <button
              key={p}
              type="button"
              role="option"
              aria-selected={value === p}
              className={`audio-option${value === p ? ' active' : ''}`}
              onClick={() => { onChange(p); setOpen(false); }}
            >
              {AMBIENT_PRESET_LABELS[p]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
