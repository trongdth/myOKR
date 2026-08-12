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

import type { AmbientPreset } from "./pomodoro-storage";

export type { AmbientPreset } from "./pomodoro-storage";

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
    this.lfos.forEach((o) => {
      try {
        o.stop();
        o.disconnect();
      } catch {
        /* noop */
      }
    });
    this.lfos = [];
    this.nodes.forEach((n) => {
      try {
        // Stop any audio source nodes to prevent them from running infinitely in the background
        if ("stop" in n && typeof (n as any).stop === "function") {
          (n as any).stop();
        }
      } catch {
        /* noop */
      }
      try {
        n.disconnect();
      } catch {
        /* noop */
      }
    });
    this.nodes = [];
  }
}

/** Display labels for each preset, shared by every UI surface. */
export const AMBIENT_PRESET_LABELS: Record<AmbientPreset, string> = {
  none: "None",
  rain: "Rain",
  forest: "Forest",
  cafe: "Café",
};

// ---- shared helpers -------------------------------------------------------

/** A looping buffer of pink noise (roughly equal energy per octave). */
function pinkNoiseBuffer(audioCtx: AudioContext, seconds: number): AudioBuffer {
  const len = Math.floor(audioCtx.sampleRate * seconds);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  // Paul Kellet's economical pink-noise approximation.
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < len; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buf;
}

/** A looping buffer of white noise. */
function whiteNoiseBuffer(
  audioCtx: AudioContext,
  seconds: number,
): AudioBuffer {
  const len = Math.floor(audioCtx.sampleRate * seconds);
  const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

/** A looping noise source (never-ending once started). */
function loopingNoise(
  audioCtx: AudioContext,
  buf: AudioBuffer,
): AudioBufferSourceNode {
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.start();
  return src;
}

/** A cheap algorithmic reverb using a ConvolverNode with a generated impulse response. */
function simpleReverb(
  audioCtx: AudioContext,
  seconds: number,
  decay: number,
): ConvolverNode {
  const convolver = audioCtx.createConvolver();
  const length = Math.floor(audioCtx.sampleRate * seconds);
  const impulse = audioCtx.createBuffer(2, length, audioCtx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  convolver.buffer = impulse;
  return convolver;
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
  private dropletBuffer: AudioBuffer | null = null;

  constructor(audioCtx: AudioContext, out: AudioNode) {
    super();

    // Master Rain EQ (Dampens harsh highs above 7kHz)
    const masterFilter = audioCtx.createBiquadFilter();
    masterFilter.type = "lowpass";
    masterFilter.frequency.value = 7000;
    masterFilter.connect(out);
    this.nodes.push(masterFilter);

    // ------------------------------------------------------------------------
    // 1. Heavy Body Rumble (Low-End Depth: Brown/Pink Noise < 800Hz)
    // ------------------------------------------------------------------------
    const rumbleGain = audioCtx.createGain();
    rumbleGain.gain.value = 0.25;

    const rumbleNoise = loopingNoise(audioCtx, pinkNoiseBuffer(audioCtx, 3));
    const rumbleLp = audioCtx.createBiquadFilter();
    rumbleLp.type = "lowpass";
    rumbleLp.frequency.value = 500; // Warm, heavy rumble

    rumbleNoise.connect(rumbleLp);
    rumbleLp.connect(rumbleGain);
    rumbleGain.connect(masterFilter);

    this.nodes.push(rumbleNoise, rumbleLp, rumbleGain);

    // ------------------------------------------------------------------------
    // 2. Surface Wash & Wind Modulation (Mid-Range Sheen)
    // ------------------------------------------------------------------------
    const washGain = audioCtx.createGain();
    washGain.gain.value = 0.15;

    const washNoise = loopingNoise(audioCtx, pinkNoiseBuffer(audioCtx, 3));
    const washBp = audioCtx.createBiquadFilter();
    washBp.type = "bandpass";
    washBp.frequency.value = 2800;
    washBp.Q.value = 0.6; // Broad passband

    washNoise.connect(washBp);
    washBp.connect(washGain);
    washGain.connect(masterFilter);

    // Wind LFO: Drifts filter cutoff and gain
    const cutLfo = audioCtx.createOscillator();
    cutLfo.type = "sine";
    cutLfo.frequency.value = rand(0.08, 0.18);

    const cutLfoGain = audioCtx.createGain();
    cutLfoGain.gain.value = 1200; // Cutoff shifts between 1600Hz - 4000Hz

    cutLfo.connect(cutLfoGain);
    cutLfoGain.connect(washBp.frequency);
    cutLfo.start();

    this.nodes.push(washNoise, washBp, washGain, cutLfoGain);
    this.lfos.push(cutLfo);

    // ------------------------------------------------------------------------
    // 3. Pre-cached Droplet Impulse Buffer & Scheduler
    // ------------------------------------------------------------------------
    this.dropletBuffer = this.createDropletBuffer(audioCtx);
    this.scheduleDroplets(audioCtx, masterFilter);
  }

  /**
   * Pre-generates a single 100ms noise burst buffer to avoid allocate-on-render GC lag.
   */
  private createDropletBuffer(audioCtx: AudioContext): AudioBuffer {
    const len = Math.floor(audioCtx.sampleRate * 0.08);
    const buf = audioCtx.createBuffer(1, len, audioCtx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const t = i / len;
      // Exponential decay envelope baked into buffer
      data[i] = (Math.random() * 2 - 1) * Math.exp(-6 * t);
    }
    return buf;
  }

  private scheduleDroplets(
    audioCtx: AudioContext,
    destination: AudioNode,
  ): void {
    const tick = () => {
      if (audioCtx.state === "closed") return;
      // If context is suspended, wait for it to resume to avoid scheduling collisions
      if (audioCtx.state === "suspended") {
        const timerId = window.setTimeout(tick, 100);
        this.timers.push(timerId);
        return;
      }

      this.spawnDroplet(audioCtx, destination);

      // Random density variation for natural falling rhythm
      const timerId = window.setTimeout(tick, rand(30, 150));
      this.timers.push(timerId);
    };

    const initialTimerId = window.setTimeout(tick, rand(50, 200));
    this.timers.push(initialTimerId);
  }

  private spawnDroplet(audioCtx: AudioContext, destination: AudioNode): void {
    if (!this.dropletBuffer) return;

    const t = audioCtx.currentTime;
    const dur = rand(0.02, 0.06);

    // Layer A: High-frequency noise splatter (water hitting glass/metal)
    const noiseSrc = audioCtx.createBufferSource();
    noiseSrc.buffer = this.dropletBuffer;
    noiseSrc.playbackRate.value = rand(0.8, 1.4); // Random pitch shift per droplet

    const hp = audioCtx.createBiquadFilter();
    hp.type = "highpass";
    hp.frequency.value = rand(2200, 4500);

    const noiseGain = audioCtx.createGain();
    const startGain = rand(0.02, 0.09);
    noiseGain.gain.setValueAtTime(startGain, t);
    // Fixed: Add exponential decay to prevent clicking on abrupt noise cutoff
    noiseGain.gain.exponentialRampToValueAtTime(0.00001, t + dur);

    // Layer B: Pitched resonant "plop" tone (droplet impact resonance)
    const pitchOsc = audioCtx.createOscillator();
    const pitchGain = audioCtx.createGain();

    const startFreq = rand(1200, 2400);
    pitchOsc.type = "sine";
    pitchOsc.frequency.setValueAtTime(startFreq, t);
    // Rapid downward pitch sweep gives water impact characteristic
    pitchOsc.frequency.exponentialRampToValueAtTime(startFreq * 0.3, t + dur);

    pitchGain.gain.setValueAtTime(0.04, t);
    pitchGain.gain.exponentialRampToValueAtTime(0.00001, t + dur);

    // Spatial Panning
    const pan = audioCtx.createStereoPanner();
    pan.pan.value = rand(-0.9, 0.9);

    // Route noise & pitch to panner
    noiseSrc.connect(hp);
    hp.connect(noiseGain);
    noiseGain.connect(pan);

    pitchOsc.connect(pitchGain);
    pitchGain.connect(pan);

    pan.connect(destination);

    // Playback
    noiseSrc.start(t);
    pitchOsc.start(t);
    noiseSrc.stop(t + dur + 0.01);
    pitchOsc.stop(t + dur + 0.01);

    // Cleanup node routing on completion
    pitchOsc.onended = () => {
      try {
        noiseSrc.disconnect();
        hp.disconnect();
        noiseGain.disconnect();
        pitchOsc.disconnect();
        pitchGain.disconnect();
        pan.disconnect();
      } catch {
        /* no-op on engine disposal */
      }
    };
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
    lp.type = "lowpass";
    lp.frequency.value = 1500;
    lp.Q.value = 1.2;
    noiseGain.connect(lp);
    this.nodes.push(lp);

    // Dual gust LFOs (Inlined to properly track and disconnect the gain nodes)
    const gustLfo1 = audioCtx.createOscillator();
    gustLfo1.type = "sine";
    gustLfo1.frequency.value = 0.08;
    const gustLfo1Gain = audioCtx.createGain();
    gustLfo1Gain.gain.value = 700;
    gustLfo1.connect(gustLfo1Gain);
    gustLfo1Gain.connect(lp.frequency);
    lp.frequency.value = 1500;
    gustLfo1.start();
    this.nodes.push(gustLfo1Gain);
    this.lfos.push(gustLfo1);

    const gustLfo2 = audioCtx.createOscillator();
    gustLfo2.type = "sine";
    gustLfo2.frequency.value = 0.03;
    const gustLfo2Gain = audioCtx.createGain();
    gustLfo2Gain.gain.value = 0.06;
    gustLfo2.connect(gustLfo2Gain);
    gustLfo2Gain.connect(noiseGain.gain);
    noiseGain.gain.value = 0.16;
    gustLfo2.start();
    this.nodes.push(gustLfo2Gain);
    this.lfos.push(gustLfo2);

    const reverb = simpleReverb(audioCtx, 2.0, 3.0);
    lp.connect(out); // Dry
    lp.connect(reverb); // Wet
    reverb.connect(out);
    this.nodes.push(reverb);

    this.scheduleChirps(audioCtx, reverb);
  }

  private scheduleChirps(audioCtx: AudioContext, reverb: AudioNode) {
    const tick = () => {
      if (audioCtx.state === "closed") return;
      if (audioCtx.state === "suspended") {
        const timerId = window.setTimeout(tick, 100);
        this.timers.push(timerId);
        return;
      }
      this.spawnChirp(audioCtx, reverb);
      const timerId = window.setTimeout(tick, rand(3000, 10000));
      this.timers.push(timerId);
    };
    const initialTimerId = window.setTimeout(tick, rand(1500, 4000));
    this.timers.push(initialTimerId);
  }

  private spawnChirp(audioCtx: AudioContext, reverb: AudioNode) {
    const t = audioCtx.currentTime;
    const dur = rand(0.05, 0.12);
    const startFreq = rand(2500, 4500);
    const endFreq = Math.max(1800, startFreq - rand(400, 1200));

    const osc = audioCtx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(startFreq, t);
    osc.frequency.exponentialRampToValueAtTime(endFreq, t + dur);

    const g = audioCtx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);

    const pan = audioCtx.createStereoPanner();
    pan.pan.value = rand(-0.8, 0.8);

    osc.connect(g);
    g.connect(pan);
    pan.connect(reverb);
    osc.start(t);
    osc.stop(t + dur + 0.05);

    // Fixed: Clean up nodes to prevent memory leaks on every chirp
    osc.onended = () => {
      try {
        osc.disconnect();
        g.disconnect();
        pan.disconnect();
      } catch {
        /* noop */
      }
    };
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

    // Master Warmth / Acoustic Dampening Node (cuts harsh high-end)
    const masterFilter = audioCtx.createBiquadFilter();
    masterFilter.type = "lowpass";
    masterFilter.frequency.value = 4500;
    masterFilter.connect(out);
    this.nodes.push(masterFilter);

    // ------------------------------------------------------------------------
    // 1. Warm "Vowel" Chatter (Formant-Filtered Pink Noise)
    // ------------------------------------------------------------------------
    const pinkNoise = loopingNoise(audioCtx, pinkNoiseBuffer(audioCtx, 3));

    // Vocal Formant Frequencies (F1: ~500Hz, F2: ~1500Hz, F3: ~2500Hz)
    const formants = [
      { freq: 500, Q: 3.5, gain: 0.12 },
      { freq: 1500, Q: 4.0, gain: 0.08 },
      { freq: 2500, Q: 4.5, gain: 0.04 },
    ];

    const chatterSum = audioCtx.createGain();
    chatterSum.gain.value = 1.0;

    formants.forEach(({ freq, Q, gain }) => {
      const bp = audioCtx.createBiquadFilter();
      bp.type = "bandpass";
      bp.frequency.value = freq;
      bp.Q.value = Q;

      const g = audioCtx.createGain();
      g.gain.value = gain;

      // Subtle frequency drift LFOs for natural vocal movement
      const lfo = audioCtx.createOscillator();
      lfo.type = "sine";
      lfo.frequency.value = rand(0.1, 0.4); // Very slow drift

      const lfoGain = audioCtx.createGain();
      lfoGain.gain.value = freq * 0.08; // Slight formant shifting

      lfo.connect(lfoGain);
      lfoGain.connect(bp.frequency);
      lfo.start();

      pinkNoise.connect(bp);
      bp.connect(g);
      g.connect(chatterSum);

      this.nodes.push(bp, g, lfoGain);
      this.lfos.push(lfo);
    });

    // Overall Speech Cadence AM (Slow organic swelling)
    const cadenceLfo = audioCtx.createOscillator();
    cadenceLfo.type = "sine";
    cadenceLfo.frequency.value = rand(2, 4);

    const cadenceGain = audioCtx.createGain();
    cadenceGain.gain.value = 0.03; // Subtle volume movement

    cadenceLfo.connect(cadenceGain);
    cadenceGain.connect(chatterSum.gain);
    cadenceLfo.start();

    this.nodes.push(pinkNoise, chatterSum, cadenceGain);
    this.lfos.push(cadenceLfo);

    // ------------------------------------------------------------------------
    // 2. Diffused Room Reverb
    // ------------------------------------------------------------------------
    const reverb = simpleReverb(audioCtx, 1.5, 2.0);
    chatterSum.connect(masterFilter); // Dry
    chatterSum.connect(reverb); // Wet
    reverb.connect(masterFilter);
    this.nodes.push(reverb);

    // ------------------------------------------------------------------------
    // 3. Periodic Ceramic Modal Clinks
    // ------------------------------------------------------------------------
    this.scheduleClinks(audioCtx, reverb);
  }

  private scheduleClinks(audioCtx: AudioContext, reverb: AudioNode): void {
    const tick = () => {
      if (audioCtx.state === "closed") return;
      if (audioCtx.state === "suspended") {
        const timerId = window.setTimeout(tick, 100);
        this.timers.push(timerId);
        return;
      }

      this.spawnModalClink(audioCtx, reverb);

      const timerId = window.setTimeout(tick, rand(2000, 7000));
      this.timers.push(timerId);
    };

    const initialTimerId = window.setTimeout(tick, rand(1000, 3000));
    this.timers.push(initialTimerId);
  }

  private spawnModalClink(audioCtx: AudioContext, reverb: AudioNode): void {
    const t = audioCtx.currentTime;
    const fundamental = rand(2100, 2900); // Ceramic body pitch center
    const dur = rand(0.03, 0.08); // Very short impact tail

    // Ceramic resonant modes (Physical acoustic ratios for glass/pottery)
    const modes = [
      { ratio: 1.0, decayMult: 1.0, gain: 0.12 },
      { ratio: 1.52, decayMult: 0.7, gain: 0.08 },
      { ratio: 2.18, decayMult: 0.4, gain: 0.04 },
    ];

    const clinkMix = audioCtx.createGain();
    const pan = audioCtx.createStereoPanner();
    pan.pan.value = rand(-0.7, 0.7);

    clinkMix.connect(pan);
    pan.connect(reverb);

    const activeOscillators: OscillatorNode[] = [];
    const activeGains: GainNode[] = [];

    // Construct modal body
    modes.forEach(({ ratio, decayMult, gain }) => {
      const osc = audioCtx.createOscillator();
      const env = audioCtx.createGain();

      osc.type = "sine";
      osc.frequency.value = fundamental * ratio;

      const modeDur = dur * decayMult;

      // Ultra-fast exponential decay envelope
      env.gain.setValueAtTime(0.00001, t);
      env.gain.exponentialRampToValueAtTime(gain, t + 0.001); // Instant impact
      env.gain.exponentialRampToValueAtTime(0.00001, t + modeDur);

      osc.connect(env);
      env.connect(clinkMix);

      osc.start(t);
      osc.stop(t + modeDur + 0.01);

      activeOscillators.push(osc);
      activeGains.push(env);
    });

    // Cleanup ephemeral nodes when mode 1 stops
    activeOscillators[0].onended = () => {
      try {
        activeOscillators.forEach((o) => o.disconnect());
        activeGains.forEach((g) => g.disconnect());
        clinkMix.disconnect();
        pan.disconnect();
      } catch {
        /* no-op on early dispose */
      }
    };
  }
}

// ---- host -----------------------------------------------------------------

function buildEngine(
  audioCtx: AudioContext,
  out: AudioNode,
  preset: AmbientPreset,
): Engine | null {
  switch (preset) {
    case "rain":
      return new RainEngine(audioCtx, out);
    case "forest":
      return new ForestEngine(audioCtx, out);
    case "cafe":
      return new CafeEngine(audioCtx, out);
    default:
      return null; // 'none' — nothing to build.
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
  if (current) {
    current.dispose();
    current = null;
  }
  currentPreset = preset;

  if (preset === "none") {
    // Stop tears down audio entirely; nothing to build for 'none'.
    stopAmbient();
    return;
  }

  try {
    const Ctor =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!Ctor) return;
    if (ctx && ctx.state === "closed") ctx = null;
    if (!ctx) ctx = new Ctor();
    ctx.resume();

    if (!master) {
      master = ctx.createGain();
      master.gain.value = 0.7;
      master.connect(ctx.destination);
    }

    const engine = buildEngine(ctx, master, preset);
    if (engine) current = engine;
  } catch {
    /* no audio support */
  }
}

/**
 * Stop ambient sound and tear everything down. Idempotent. Suspends (does not
 * close) the AudioContext so it can be reused by a later `startAmbient`.
 */
export function stopAmbient(): void {
  if (current) {
    current.dispose();
    current = null;
  }
  currentPreset = null;
  if (master) {
    try {
      master.disconnect();
    } catch {
      /* noop */
    }
    master = null;
  }
  ctx?.suspend().catch(() => {
    /* noop */
  });
}
