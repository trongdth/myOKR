// Generative ambient background sound via the Web Audio API (ADR-0015).
//
// Three procedural presets — Rain, Forest, Café — replacing the legacy Am–F–C–G
// synth-pad drone (the old `focusMusicEnabled` boolean). No audio assets: every
// preset is synthesized from noise + oscillators + filters + envelopes, so there
// are no licensing obligations. Recipes decided in the grilling session and
// recorded in docs/adr/0015-ambient-sound-synth-engines.md.
//
// Stateless from the caller's view: start/stop are idempotent and stop fully
// tears down every scheduled node, timer, and listener, so switching presets at
// runtime never leaks nodes (the `Engine` interface's `dispose()` is the
// contract). The AudioContext itself is reused across presets and only
// suspended on stop.

import type { AmbientPreset } from './pomodoro-storage';

export type { AmbientPreset } from './pomodoro-storage';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let current: Engine | null = null;
let currentPreset: AmbientPreset | null = null;

/**
 * A self-contained sound generator. Builds its own node graph on the shared
 * AudioContext + master bus, schedules its own events, and tears everything
 * down on `dispose()`. The host (`startAmbient`/`stopAmbient`) owns the
 * AudioContext and master gain; the engine owns everything downstream.
 */
interface Engine {
  dispose(): void;
}

/**
 * Base class holding the three "things to tear down" every engine creates —
 * long-lived AudioNodes, looping LFO oscillators, and scheduler timers. The
 * concrete engines push into these arrays; `dispose()` clears all three in the
 * same way for every engine, so the teardown contract is defined once.
 */
abstract class AbstractEngine implements Engine {
  protected nodes: AudioNode[] = [];
  protected lfos: OscillatorNode[] = [];
  protected timers: number[] = [];

  dispose(): void {
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.lfos.forEach(o => { try { o.stop(); o.disconnect(); } catch { /* noop */ } });
    this.lfos = [];
    this.nodes.forEach(n => { try { n.disconnect(); } catch { /* noop */ } });
    this.nodes = [];
  }
}

/** Display labels for each preset, shared by every UI surface. */
export const AMBIENT_PRESET_LABELS: Record<AmbientPreset, string> = {
  none: 'None',
  rain: 'Rain',
  forest: 'Forest',
  cafe: 'Café',
};

// ---- shared helpers -------------------------------------------------------

/** A looping buffer of pink noise (roughly equal energy per octave). */
function pinkNoiseBuffer(audioCtx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(audioCtx.sampleRate * seconds);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  // Paul Kellet's economical pink-noise approximation.
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buf;
}

/** A looping buffer of white noise. */
function whiteNoiseBuffer(audioCtx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(audioCtx.sampleRate * seconds);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** A looping noise source (never-ending once started). */
function loopingNoise(audioCtx: AudioContext, buf: AudioBuffer): AudioBufferSourceNode {
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start();
  return src;
}

/**
 * A slow sine LFO patched to a param. Returns a stoppable handle so the engine
 * can disconnect it on dispose (the OscillatorNode would otherwise leak).
 */
function sineLfo(
  audioCtx: AudioContext,
  freqHz: number,
  depth: number,
  offset: number,
  target: AudioParam,
): OscillatorNode {
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freqHz;
  gain.gain.value = depth;
  osc.connect(gain);
  gain.connect(target);
  target.value = offset;
  osc.start();
  return osc;
}

/** A cheap algorithmic reverb: a multi-tap delay feedback network. */
function simpleReverb(audioCtx: AudioContext, seconds: number, feedback: number): DelayNode {
  const delay = audioCtx.createDelay(5.0);
  delay.delayTime.value = Math.min(seconds, 5.0);
  const fb = audioCtx.createGain();
  fb.gain.value = feedback;
  delay.connect(fb);
  fb.connect(delay);
  return delay;
}

/** Random float in [min, max). */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

// ---- RainEngine -----------------------------------------------------------
// Body: pink noise → bandpass (~3 kHz, Q 0.7), slow LFO on cutoff + master gain
// for wind-shifting density. Droplets: white-noise impulses → highpass (~2.5 kHz),
// fast decay (30–80 ms), randomized stereo pan and gain.

class RainEngine extends AbstractEngine {
  constructor(audioCtx: AudioContext, out: AudioNode) {
    super();
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.18;
    this.nodes.push(noiseGain);

    const body = loopingNoise(audioCtx, pinkNoiseBuffer(audioCtx, 3));
    body.connect(noiseGain);
    this.nodes.push(body);

    const bp = audioCtx.createBiquadFilter();
    bp.type = 'lowpass';
    bp.frequency.value = 3000;
    bp.Q.value = 0.7;
    noiseGain.connect(bp);
    this.nodes.push(bp);

    // Slow wind LFO: cutoff drifts 1.2–3.8 kHz; gain swells 0.12↔0.26.
    const cutLfo = sineLfo(audioCtx, rand(0.05, 0.2), 1300, 2500, bp.frequency);
    this.lfos.push(cutLfo);
    const gainLfo = sineLfo(audioCtx, rand(0.05, 0.2), 0.07, 0.19, noiseGain.gain);
    this.lfos.push(gainLfo);

    bp.connect(out);
    this.scheduleDroplets(audioCtx, out);
  }

  private scheduleDroplets(audioCtx: AudioContext, out: AudioNode) {
    const tick = () => {
      if (audioCtx.state === 'closed') return;
      this.spawnDroplet(audioCtx, out);
      this.timers.push(window.setTimeout(tick, rand(40, 220)));
    };
    tick();
  }

  private spawnDroplet(audioCtx: AudioContext, out: AudioNode) {
    const t = audioCtx.currentTime;
    const dur = rand(0.03, 0.08);

    const burst = audioCtx.createBufferSource();
    const len = Math.floor(audioCtx.sampleRate * dur);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const env = Math.exp(-3 * (i / len));
      data[i] = (Math.random() * 2 - 1) * env;
    }
    burst.buffer = buf;

    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 2500;

    const g = audioCtx.createGain();
    g.gain.value = rand(0.04, 0.18);

    const pan = audioCtx.createStereoPanner();
    pan.pan.value = rand(-1.0, 1.0);

    burst.connect(hp); hp.connect(g); g.connect(pan); pan.connect(out);
    burst.start(t);
    burst.stop(t + dur + 0.02);
  }
}

// ---- ForestEngine ---------------------------------------------------------
// Wind/leaves: white noise → resonant lowpass (~1.5 kHz, Q 1.2), dual sine LFOs
// (0.08 Hz, 0.03 Hz) on cutoff + gain for gusting swells. Bird chirps: sine,
// 2.5–4.5 kHz, downward pitch sweep 50–120 ms, semi-random triggers (3–10 s),
// through ~2 s spatial reverb.

class ForestEngine extends AbstractEngine {
  constructor(audioCtx: AudioContext, out: AudioNode) {
    super();
    const noiseGain = audioCtx.createGain();
    noiseGain.gain.value = 0.16;
    this.nodes.push(noiseGain);

    const wind = loopingNoise(audioCtx, whiteNoiseBuffer(audioCtx, 3));
    wind.connect(noiseGain);
    this.nodes.push(wind);

    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 1500;
    lp.Q.value = 1.2;
    noiseGain.connect(lp);
    this.nodes.push(lp);

    // Dual gust LFOs.
    this.lfos.push(sineLfo(audioCtx, 0.08, 700, 1500, lp.frequency));
    this.lfos.push(sineLfo(audioCtx, 0.03, 0.06, 0.16, noiseGain.gain));

    const reverb = simpleReverb(audioCtx, 2.0, 0.4);
    lp.connect(out);
    lp.connect(reverb);
    reverb.connect(out);
    this.nodes.push(reverb);

    this.scheduleChirps(audioCtx, reverb);
  }

  private scheduleChirps(audioCtx: AudioContext, reverb: AudioNode) {
    const tick = () => {
      if (audioCtx.state === 'closed') return;
      this.spawnChirp(audioCtx, reverb);
      this.timers.push(window.setTimeout(tick, rand(3000, 10000)));
    };
    this.timers.push(window.setTimeout(tick, rand(1500, 4000)));
  }

  private spawnChirp(audioCtx: AudioContext, reverb: AudioNode) {
    const t = audioCtx.currentTime;
    const dur = rand(0.05, 0.12);
    const startFreq = rand(2500, 4500);
    const endFreq = Math.max(1800, startFreq - rand(400, 1200));

    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const pan = audioCtx.createStereoPanner();
    pan.pan.value = rand(-0.8, 0.8);

    osc.connect(g); g.connect(pan); pan.connect(reverb);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }
}

// ---- CafeEngine -----------------------------------------------------------
// Chatter hum: pink noise with AM → bandpass formed by highpass (300 Hz) +
// lowpass (3500 Hz) to admit the speech-fundamentals band, sample-and-hold/
// random LFO on gain at 4–8 Hz for speech cadence. Clinks: dual FM sine /
// ring mod (base ~2 kHz, mod ratio ~1.414), 40–150 ms exp decay, periodic random
// impulses through a short high-diffusion plate reverb.

class CafeEngine extends AbstractEngine {
  constructor(audioCtx: AudioContext, out: AudioNode) {
    super();
    const humGain = audioCtx.createGain();
    humGain.gain.value = 0.14;
    this.nodes.push(humGain);

    const hum = loopingNoise(audioCtx, pinkNoiseBuffer(audioCtx, 3));
    hum.connect(humGain);
    this.nodes.push(hum);

    // Speech-fundamentals band: highpass at 300 Hz cascaded with lowpass at
    // 3500 Hz (a single biquad bandpass can't span ~3.5 octaves at Q 1.0).
    const hp = audioCtx.createBiquadFilter();
    hp.type = 'highpass';
    hp.frequency.value = 300;
    hp.Q.value = 1.0;
    const lp = audioCtx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 3500;
    lp.Q.value = 1.0;
    humGain.connect(hp); hp.connect(lp);
    this.nodes.push(hp, lp);

    // Speech-cadence AM: a 4–8 Hz square-ish LFO on the hum gain.
    const am = audioCtx.createOscillator();
    am.type = 'square';
    am.frequency.value = rand(4, 8);
    const amGain = audioCtx.createGain();
    amGain.gain.value = 0.06;
    am.connect(amGain);
    amGain.connect(humGain.gain);
    am.start();
    this.lfos.push(am);

    lp.connect(out);

    const reverb = simpleReverb(audioCtx, 0.4, 0.3);
    reverb.connect(out);
    this.nodes.push(reverb);

    this.scheduleClinks(audioCtx, reverb);
  }

  private scheduleClinks(audioCtx: AudioContext, reverb: AudioNode) {
    const tick = () => {
      if (audioCtx.state === 'closed') return;
      this.spawnClink(audioCtx, reverb);
      this.timers.push(window.setTimeout(tick, rand(1500, 6000)));
    };
    this.timers.push(window.setTimeout(tick, rand(800, 2500)));
  }

  private spawnClink(audioCtx: AudioContext, reverb: AudioNode) {
    const t = audioCtx.currentTime;
    const dur = rand(0.04, 0.15);
    const carrier = rand(1800, 2400);
    const ratio = 1.414;

    const mod = audioCtx.createOscillator();
    mod.type = 'sine';
    mod.frequency.value = carrier * ratio;
    const modGain = audioCtx.createGain();
    modGain.gain.value = carrier * 1.5;
    mod.connect(modGain);

    const car = audioCtx.createOscillator();
    car.type = 'sine';
    car.frequency.value = carrier;
    modGain.connect(car.frequency);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(rand(0.08, 0.16), t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const pan = audioCtx.createStereoPanner();
    pan.pan.value = rand(-0.6, 0.6);

    car.connect(g); g.connect(pan); pan.connect(reverb);
    mod.start(t); car.start(t);
    mod.stop(t + dur + 0.05); car.stop(t + dur + 0.05);
  }
}

// ---- host -----------------------------------------------------------------

function buildEngine(audioCtx: AudioContext, out: AudioNode, preset: AmbientPreset): Engine | null {
  switch (preset) {
    case 'rain':   return new RainEngine(audioCtx, out);
    case 'forest': return new ForestEngine(audioCtx, out);
    case 'cafe':   return new CafeEngine(audioCtx, out);
    default:       return null; // 'none' — nothing to build.
  }
}

/**
 * Start the named ambient preset. Idempotent: calling with the same preset while
 * it's already running is a no-op; calling with a different preset swaps engines
 * cleanly (the old engine is fully disposed before the new one builds). `'none'`
 * stops any running sound. Safe to call when Web Audio is unavailable.
 */
export function startAmbient(preset: AmbientPreset): void {
  // Already running the requested preset — nothing to do.
  if (currentPreset === preset && current !== null) return;

  // Different preset or first start — tear down whatever is running first.
  if (current) { current.dispose(); current = null; }
  currentPreset = preset;

  if (preset === 'none') {
    // Stop tears down audio entirely; nothing to build for 'none'.
    stopAmbient();
    return;
  }

  try {
    const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return;
    if (ctx && ctx.state === 'closed') ctx = null;
    if (!ctx) ctx = new Ctor();
    ctx.resume();

    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
    }

    const engine = buildEngine(ctx, master, preset);
    if (engine) current = engine;
  } catch { /* no audio support */ }
}

/**
 * Stop ambient sound and tear everything down. Idempotent. Suspends (does not
 * close) the AudioContext so it can be reused by a later `startAmbient`.
 */
export function stopAmbient(): void {
  if (current) { current.dispose(); current = null; }
  currentPreset = null;
  if (master) {
    try { master.disconnect(); } catch { /* noop */ }
    master = null;
  }
  ctx?.suspend().catch(() => { /* noop */ });
}
