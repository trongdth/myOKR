// Generative ambient focus music via the Web Audio API.
//
// Soft synth pad over a FIXED, repeating minor chord progression (Am–F–C–G),
// with sparse consonant arpeggio notes and echo. Instrumental, predictable
// (same 4-chord loop repeats for the whole session), no lyrics, no harsh
// transients. Loops indefinitely.
//
// Stateless from the caller's view: start/stop are idempotent. Same API as the
// earlier brown-noise version, so the PomodoroApp wiring is unchanged.

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let stopFlag = false;
let schedulerTimer: number | null = null;
let nextNoteTime = 0;
let step = 0;

// Fixed progression (A natural minor). Predictable: this 4-chord loop repeats.
// Each entry = chord tones [root, third, fifth] in Hz.
const PROGRESSION: number[][] = [
  [220.00, 261.63, 329.63], // Am: A3 C4 E4
  [174.61, 220.00, 261.63], // F:  F3 A3 C4
  [261.63, 329.63, 392.00], // C:  C4 E4 G4
  [261.63, 329.63, 392.00], // C:  C4 E4 G4
];
// A-minor pentatonic — any pick is consonant over every chord above.
const PENTATONIC = [220.00, 261.63, 293.66, 329.63, 392.00, 440.00, 523.25];

const CHORD_BEATS = 8;     // each chord lasts 8 beats
const BEAT = 0.5;          // seconds per beat
const LOOKAHEAD = 0.1;     // schedule notes up to 100ms ahead
const TIMER_MS = 25;       // scheduler wake interval

// Sustained pad voice: two slightly detuned oscillators with a soft swell.
function playPad(freq: number, start: number, dur: number, dest: AudioNode) {
  const osc1 = ctx!.createOscillator();
  const osc2 = ctx!.createOscillator();
  const g = ctx!.createGain();
  osc1.type = 'sine';
  osc2.type = 'triangle';
  osc1.frequency.value = freq;
  osc2.frequency.value = freq * 1.005; // detune for warmth
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.05, start + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, start + dur);
  osc1.connect(g); osc2.connect(g); g.connect(dest);
  osc1.start(start); osc2.start(start);
  const end = start + dur + 0.05;
  osc1.stop(end); osc2.stop(end);
}

// Soft pluck: triangle wave with a quick attack and long, gentle release.
function playPluck(freq: number, start: number, dest: AudioNode) {
  const osc = ctx!.createOscillator();
  const g = ctx!.createGain();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(0.1, start + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, start + 1.4);
  osc.connect(g); g.connect(dest);
  osc.start(start);
  osc.stop(start + 1.5);
}

// Lookahead scheduler (the "two clocks" pattern): schedule notes on the precise
// audio clock a little ahead of time, re-checked every TIMER_MS.
function scheduler() {
  if (!ctx || stopFlag) return;
  while (nextNoteTime < ctx.currentTime + LOOKAHEAD) {
    const beatInLoop = step % (CHORD_BEATS * PROGRESSION.length);
    const chord = PROGRESSION[Math.floor(beatInLoop / CHORD_BEATS)];

    // Re-strike the pad at the start of each chord for a continuous bed.
    if (beatInLoop % CHORD_BEATS === 0) {
      const padDur = CHORD_BEATS * BEAT;
      for (const f of chord) playPad(f, nextNoteTime, padDur, master!);
    }

    // Sparse arpeggio: every other beat, ~40% of the time, always consonant.
    if (step % 2 === 0 && Math.random() < 0.4) {
      playPluck(PENTATONIC[Math.floor(Math.random() * PENTATONIC.length)], nextNoteTime, master!);
    }

    nextNoteTime += BEAT;
    step++;
  }
  schedulerTimer = window.setTimeout(scheduler, TIMER_MS);
}

export function startFocusMusic(): void {
  stopFocusMusic();
  try {
    const Ctor = window.AudioContext || (window as any).webkitAudioContext;
    if (!Ctor) return;
    if (ctx && ctx.state === 'closed') {
      ctx = null;
    }
    if (!ctx) ctx = new Ctor();
    ctx.resume();

    master = ctx.createGain();
    master.gain.value = 0.5;

    // Warm low-pass to take the edge off every voice.
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;

    // Dotted-eighth echo for ambience.
    const delay = ctx.createDelay();
    delay.delayTime.value = BEAT * 0.75;
    const feedback = ctx.createGain();
    feedback.gain.value = 0.3;

    // Routing: master -> filter -> destination (dry); filter -> delay -> destination
    // (echo), with delay -> feedback -> delay for repeats.
    master.connect(filter);
    filter.connect(ctx.destination);
    filter.connect(delay);
    delay.connect(feedback);
    feedback.connect(delay);
    delay.connect(ctx.destination);

    stopFlag = false;
    step = 0;
    nextNoteTime = ctx.currentTime + 0.1;
    scheduler();
  } catch { /* no audio support */ }
}

export function stopFocusMusic(): void {
  stopFlag = true;
  if (schedulerTimer !== null) {
    clearTimeout(schedulerTimer);
    schedulerTimer = null;
  }
  if (master) {
    try { master.disconnect(); } catch { /* noop */ }
    master = null;
  }
  ctx?.suspend().catch(() => { /* noop */ });
}
