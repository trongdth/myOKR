// Generative ambient background sound via the Web Audio API (ADR-0015).
//
// Three procedural presets — Rain, Forest, Café — synthesized from noise +
// oscillators + filters + envelopes. No audio assets, no licensing obligations.
//
// Design rules this file follows:
//
//   1. DENSE TEXTURE GOES IN A BUFFER, SPARSE EVENTS GO IN THE SCHEDULER.
//      Rain has thousands of impacts per second. Scheduling those as nodes
//      would melt the main thread, so the granular "patter" is rendered once
//      into a looping buffer. Only rare, individually-audible events (drips,
//      bird phrases, cup clinks) become live nodes.
//
//   2. EVENTS ARE SCHEDULED AHEAD IN *AUDIO* TIME, NOT FIRED FROM setTimeout.
//      Background tabs clamp timers to >=1s. A one-timer-per-event design
//      collapses under that. See LookaheadScheduler.
//
//   3. NOTHING IS PERIODIC. Every LFO in a long-running ambience eventually
//      becomes audible as a pattern. Slow movement is driven by random-walk
//      targets (setTargetAtTime), not by sine oscillators.
//
//   4. GAIN IS STAGED AND LIMITED. Each preset has a trim so the three sit at
//      comparable loudness, and a soft limiter catches transient peaks.
//
// Stateless from the caller's view: start/stop are idempotent, and stop tears
// down every node, timer and listener, so switching presets never leaks.

import type { AmbientPreset } from "./pomodoro-storage";

export type { AmbientPreset } from "./pomodoro-storage";

// ---- tuning constants -----------------------------------------------------

/** How far ahead (seconds) the scheduler commits events to the audio clock. */
const LOOKAHEAD_S = 2.5;
/** How often (ms) the scheduler wakes to refill the lookahead window. */
const SCHEDULER_TICK_MS = 400;
/** Master fade to avoid a click on start/stop. */
const FADE_IN_S = 1.5;
const FADE_OUT_S = 0.7;
/** exponentialRamp cannot touch zero. */
const EPS = 1e-4;

/**
 * Per-preset output trim. Set by ear against a reference; the goal is that
 * switching presets at a fixed system volume produces no jump in loudness.
 */
const PRESET_TRIM: Record<AmbientPreset, number> = {
  none: 0,
  rain: 1.0,
  forest: 1.1,
  cafe: 0.95,
};

/** Display labels for each preset, shared by every UI surface. */
export const AMBIENT_PRESET_LABELS: Record<AmbientPreset, string> = {
  none: "None",
  rain: "Rain",
  forest: "Forest",
  cafe: "Café",
};

// ---- small helpers --------------------------------------------------------

/** Random float in [min, max). */
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

/** Random integer in [min, max]. */
function randInt(min: number, max: number): number {
  return Math.floor(rand(min, max + 1));
}

function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

/** Narrowing guard so dispose() never needs `any` to stop a source node. */
function isScheduledSource(n: AudioNode): n is AudioScheduledSourceNode {
  return typeof (n as Partial<AudioScheduledSourceNode>).stop === "function";
}

/**
 * The pause rule shared by every engine scheduler. Only `'running'` advances
 * currentTime, so it is the only state in which scheduling is meaningful.
 * `'suspended'` and iOS Safari's `'interrupted'` freeze the clock; `'closed'`
 * is terminal and would throw. Kept exported for the existing unit tests.
 */
export function shouldTickAudio(state: AudioContextState): boolean {
  return state === "running";
}

function biquad(
  ctx: AudioContext,
  type: BiquadFilterType,
  freq: number,
  q = 0.7,
  gainDb?: number,
): BiquadFilterNode {
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  if (gainDb !== undefined) f.gain.value = gainDb;
  return f;
}

function gainNode(ctx: AudioContext, value: number): GainNode {
  const g = ctx.createGain();
  g.gain.value = value;
  return g;
}

/**
 * Percussive envelope: near-instant attack, exponential decay. Used for every
 * one-shot in this file. Starting from EPS rather than 0 keeps the ramp legal
 * and the 1-3 ms attack keeps it click-free.
 */
function strike(
  param: AudioParam,
  t: number,
  peak: number,
  decay: number,
  attack = 0.002,
): void {
  param.setValueAtTime(EPS, t);
  param.exponentialRampToValueAtTime(Math.max(peak, EPS * 2), t + attack);
  param.exponentialRampToValueAtTime(EPS, t + attack + decay);
}

// ---- noise generation -----------------------------------------------------

type NoiseKind = "white" | "pink" | "brown";

/**
 * Divisor applied to the context sample rate when generating a buffer.
 *
 * Every bed in this file is filtered well below Nyquist before it reaches the
 * output, so generating at the full rate is wasted work — a layer that gets
 * lowpassed at 420 Hz does not need content up to 24 kHz. An AudioBuffer may
 * carry its own sampleRate and the browser resamples it on playback, so
 * dividing by 2 or 4 cuts both generation cost and memory by the same factor
 * with no audible consequence. Pick the divisor so that sr/(2*div) still sits
 * comfortably above the layer's own filter.
 */
type RateDiv = 1 | 2 | 4;

/** Corner of the brown-noise leak, held constant across generation rates. */
const BROWN_CORNER_HZ = 150;

function bandLimitedRate(ctx: AudioContext, div: RateDiv): number {
  // Browsers reject buffer rates below ~8 kHz.
  return Math.max(8000, Math.round(ctx.sampleRate / div));
}

/** Scale a channel to a fixed RMS so layer gains mean the same thing for every
 * noise kind and every generation rate. */
function normalizeRms(a: Float32Array, target = 0.2): void {
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * a[i];
  const rms = Math.sqrt(sum / a.length);
  if (rms <= 0) return;
  const g = target / rms;
  for (let i = 0; i < a.length; i++) a[i] *= g;
}

function fillNoise(out: Float32Array, kind: NoiseKind, sampleRate: number): void {
  const n = out.length;
  if (kind === "white") {
    for (let i = 0; i < n; i++) out[i] = Math.random() * 2 - 1;
    normalizeRms(out);
    return;
  }
  if (kind === "brown") {
    // Leaky integrator, -6 dB/octave above the leak corner. The leak must be
    // derived from the sample rate: a fixed 0.02 coefficient puts the corner at
    // ~150 Hz at 48 kHz but at ~37 Hz when the buffer is generated at 12 kHz,
    // which would hand the roar and room-tone layers an octave of extra sub.
    const k = (2 * Math.PI * BROWN_CORNER_HZ) / sampleRate;
    let b = 0;
    for (let i = 0; i < n; i++) {
      b = (b + k * (Math.random() * 2 - 1)) / (1 + k);
      out[i] = b;
    }
    normalizeRms(out);
    return;
  }
  // Paul Kellet's economical pink-noise approximation. -3 dB/octave.
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < n; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + w * 0.0555179;
    b1 = 0.99332 * b1 + w * 0.0750759;
    b2 = 0.969 * b2 + w * 0.153852;
    b3 = 0.8665 * b3 + w * 0.3104856;
    b4 = 0.55 * b4 + w * 0.5329522;
    b5 = -0.7616 * b5 - w * 0.016898;
    out[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
    b6 = w * 0.115926;
  }
  normalizeRms(out);
}

/**
 * Equal-power self-crossfade so the buffer's tail flows into its own head.
 * Generates `len + fade` samples and folds the overhang back over the start,
 * which makes the wrap point sample-continuous by construction.
 *
 * Note: for pink and brown noise the naive hard splice does not measurably
 * click (their per-sample slope is already large, so the step hides inside the
 * natural distribution). This is kept because it costs nothing at generation
 * time and it does matter for the sparse patter buffer, where a splice lands
 * in near-silence and is exposed.
 */
// Return type is inferred rather than annotated: TS 5.7+ made Float32Array
// generic over its backing buffer, and a bare `Float32Array` annotation widens
// to ArrayBufferLike, which copyToChannel rejects.
function foldCrossfade(src: Float32Array, len: number, fade: number) {
  const out = new Float32Array(len);
  out.set(src.subarray(0, len));
  for (let i = 0; i < fade; i++) {
    const x = i / fade;
    out[i] = src[i] * Math.sqrt(x) + src[len + i] * Math.sqrt(1 - x);
  }
  return out;
}

/**
 * A seamless looping noise buffer.
 *
 * Kind matters less than it looks: any layer that is immediately bandpassed
 * hard can use `white`, which costs one Math.random() per sample instead of
 * seven multiply-adds. `pink` and `brown` are reserved for layers whose
 * spectral slope survives to the ear (roar, wind body, room tone, and the
 * voice excitation, where a rising white spectrum would sound thin).
 *
 * Channels are generated independently, which fully decorrelates left and
 * right — the cheapest and largest single upgrade
 * to perceived width and naturalness on headphones.
 */
function noiseBuffer(
  ctx: AudioContext,
  seconds: number,
  kind: NoiseKind,
  rateDiv: RateDiv = 2,
  channels = 2,
  fadeSec = 0.12,
): AudioBuffer {
  const sr = bandLimitedRate(ctx, rateDiv);
  const len = Math.floor(sr * seconds);
  const fade = Math.min(Math.floor(sr * fadeSec), Math.floor(len / 2));
  const buf = ctx.createBuffer(channels, len, sr);
  const scratch = new Float32Array(len + fade);
  for (let ch = 0; ch < channels; ch++) {
    fillNoise(scratch, kind, sr);
    buf.copyToChannel(foldCrossfade(scratch, len, fade), ch);
  }
  return buf;
}

/**
 * Granular impact texture: a Poisson impulse train shaped by two parallel
 * one-pole decays. This is what makes synthetic rain read as *rain* rather
 * than as filtered hiss — noise is statistically smooth, real rain is a dense
 * stochastic sequence of discrete impacts with a heavy-tailed amplitude
 * distribution, so a few impacts always poke above the bed.
 *
 * Built in O(samples) rather than O(drops x tail): the impulses are written as
 * single samples and the decay tails come from running two IIRs over the whole
 * channel. ~23 ms for 12 s of stereo at 48 kHz.
 *
 * Density and the `pow` amplitude law are tuned for a ~16 dB crest factor,
 * which is where measured natural rainfall sits.
 */
function patterBuffer(
  ctx: AudioContext,
  seconds: number,
  dropsPerSecond: number,
  rateDiv: RateDiv = 2,
  fadeSec = 0.12,
): AudioBuffer {
  const sr = bandLimitedRate(ctx, rateDiv);
  const len = Math.floor(sr * seconds);
  const fade = Math.floor(sr * fadeSec);
  const total = len + fade;
  const buf = ctx.createBuffer(2, len, sr);

  const decayA = Math.exp(-1 / (0.0006 * sr)); // bright tick
  const decayB = Math.exp(-1 / (0.0022 * sr)); // slightly wetter body

  for (let ch = 0; ch < 2; ch++) {
    const x = new Float32Array(total);
    const drops = Math.floor(dropsPerSecond * seconds);
    for (let k = 0; k < drops; k++) {
      const p = (Math.random() * total) | 0;
      x[p] += Math.pow(Math.random(), 1.5) * (Math.random() < 0.5 ? 1 : -1);
    }
    let a = 0;
    let b = 0;
    for (let i = 0; i < total; i++) {
      a = decayA * a + x[i];
      b = decayB * b + x[i];
      x[i] = a * 0.7 + b * 0.45;
    }
    // One-pole highpass: strips the DC the impulse train accumulates. The
    // coefficient is derived from sr so the corner stays put when the buffer is
    // generated at a reduced rate.
    const hp = 1 / (1 + (2 * Math.PI * 110) / sr);
    let prevIn = 0;
    let prevOut = 0;
    for (let i = 0; i < total; i++) {
      const v = x[i];
      prevOut = hp * (prevOut + v - prevIn);
      prevIn = v;
      x[i] = prevOut;
    }
    let peak = 0;
    for (let i = 0; i < total; i++) peak = Math.max(peak, Math.abs(x[i]));
    if (peak > 0) {
      const g = 0.85 / peak;
      for (let i = 0; i < total; i++) x[i] *= g;
    }
    buf.copyToChannel(foldCrossfade(x, len, fade), ch);
  }
  return buf;
}

/**
 * A looping source. `rate` is a playbackRate offset: running two sources from
 * buffers of different lengths at slightly different rates makes their loop
 * periods incommensurate, so the composite texture does not repeat on any
 * timescale a listener will notice during a work session. This is the fix for
 * loop fatigue — the audible flaw in short looping beds is not a click at the
 * splice, it is the ear learning the 3-second gesture.
 */
function loopSource(
  ctx: AudioContext,
  buf: AudioBuffer,
  rate = 1,
  startOffset = 0,
): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  src.playbackRate.value = rate;
  src.start(0, startOffset % buf.duration);
  return src;
}

// ---- reverb ---------------------------------------------------------------

interface ReverbOptions {
  seconds: number;
  decay: number;
  /** Gap before the tail starts, in seconds. Sells room size. */
  predelay?: number;
  /** 0-1. Higher = faster high-frequency loss, i.e. softer / more absorbent. */
  damping?: number;
}

/**
 * Generated-IR reverb. Two deliberate differences from the usual snippet:
 *
 *  - `normalize = false`. With normalization on, the browser rescales the IR to
 *    unit power, so changing `seconds` or `decay` silently changes the wet
 *    level and the mix has to be re-tuned every time. Here the IR is scaled to
 *    a fixed energy instead, so a wet gain of 0.3 means the same thing for
 *    every preset.
 *  - Progressive damping. A raw noise IR is bright all the way through and
 *    sounds metallic. Real spaces lose highs as the tail develops.
 */
function makeReverb(ctx: AudioContext, opts: ReverbOptions): ConvolverNode {
  const { seconds, decay, predelay = 0.012, damping = 0.5 } = opts;
  const sr = ctx.sampleRate;
  const len = Math.floor(sr * seconds);
  const pd = Math.floor(sr * predelay);
  const ir = ctx.createBuffer(2, len, sr);

  for (let ch = 0; ch < 2; ch++) {
    const d = new Float32Array(len);
    let lp = 0;
    let energy = 0;
    for (let i = pd; i < len; i++) {
      const t = (i - pd) / (len - pd);
      const n = (Math.random() * 2 - 1) * Math.pow(1 - t, decay);
      lp += (1 - damping) * (n - lp);
      d[i] = lp;
      energy += lp * lp;
    }
    const norm = energy > 0 ? 1 / Math.sqrt(energy) : 0;
    for (let i = 0; i < len; i++) d[i] *= norm;
    ir.copyToChannel(d, ch);
  }

  const conv = ctx.createConvolver();
  conv.normalize = false;
  conv.buffer = ir;
  return conv;
}

// ---- scheduling -----------------------------------------------------------

/**
 * A recurring event source. `spawn` receives an absolute AudioContext time in
 * the future and returns the gap (seconds) until it should run again, so an
 * engine can vary its own pacing — a bird phrase can take a long silence after
 * itself, a café voice can pause between sentences.
 */
type Spawn = (t: number) => number;

interface Stream {
  next: number;
  spawn: Spawn;
}

interface Engine {
  dispose(): void;
}

/**
 * Base class holding everything an engine must tear down, plus the lookahead
 * scheduler shared by all three.
 *
 * The scheduler replaces the old one-setTimeout-per-event design. That design
 * had two failure modes: timer jitter landed events at `currentTime`, i.e.
 * already inside the block the audio thread had rendered, so onsets were late
 * and inconsistently quantised; and background tabs clamp timers to >=1s,
 * which silently destroyed any stream faster than 1 Hz. Here a single 400 ms
 * timer fills a 2.5 s window of audio time, so a clamped 1 s tick still keeps
 * the window full and every event lands exactly where it was placed.
 */
abstract class AbstractEngine implements Engine {
  protected nodes: AudioNode[] = [];
  protected lfos: OscillatorNode[] = [];
  private streams: Stream[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private ctx: AudioContext | null = null;
  private disposed = false;

  protected addStream(
    ctx: AudioContext,
    spawn: Spawn,
    firstMin: number,
    firstMax: number,
  ): void {
    this.ctx = ctx;
    this.streams.push({ next: ctx.currentTime + rand(firstMin, firstMax), spawn });
    if (this.timer === null) {
      this.timer = setInterval(() => this.tick(), SCHEDULER_TICK_MS);
    }
  }

  private tick(): void {
    const ctx = this.ctx;
    if (!ctx || this.disposed || !shouldTickAudio(ctx.state)) return;
    const now = ctx.currentTime;
    const horizon = now + LOOKAHEAD_S;
    for (const s of this.streams) {
      // If the clock jumped (tab restored, device woke), do not fire a burst of
      // backlogged events — rejoin just ahead of the playhead.
      if (s.next < now) s.next = now + 0.05;
      let guard = 0;
      while (s.next < horizon && guard++ < 128) {
        const gap = s.spawn(s.next);
        s.next += Math.max(gap, 0.01);
      }
    }
  }

  /** Track a node for teardown and return it, so graph building stays terse. */
  protected keep<T extends AudioNode>(node: T): T {
    this.nodes.push(node);
    return node;
  }

  dispose(): void {
    this.disposed = true;
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.streams = [];
    for (const o of this.lfos) {
      try {
        o.stop();
        o.disconnect();
      } catch {
        /* already stopped */
      }
    }
    this.lfos = [];
    for (const n of this.nodes) {
      try {
        if (isScheduledSource(n)) n.stop();
      } catch {
        /* already stopped */
      }
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
    this.nodes = [];
    // One-shot event nodes are intentionally not tracked: they are already
    // scheduled to stop, they are short, and disconnecting their bus here
    // orphans them so they are collected as soon as they end.
  }
}

// ---- RainEngine -----------------------------------------------------------
//
// Four layers, low to high:
//   1. Roar      brown noise, lowpassed. The distant mass of the storm.
//   2. Wash      pink noise through a slowly drifting bandpass. Mid body.
//   3. Patter    pre-rendered granular impact texture. The graininess that
//                separates rain from hiss.
//   4. Drips     sparse, individually audible near-field drops.
//
// Drip physics: a real drip is *not* a downward sweep. The impact entrains an
// air bubble whose Helmholtz resonance rises as the bubble shrinks, so the
// characteristic "plink" glides UP a few percent over the first ~15 ms. The
// previous implementation swept down by 70%, which is why it read as a synth
// blip rather than water.

class RainEngine extends AbstractEngine {
  private readonly dripBus: GainNode;
  private readonly dripVerb: ConvolverNode;

  constructor(ctx: AudioContext, out: AudioNode) {
    super();

    const master = this.keep(biquad(ctx, "lowpass", 9000, 0.5));
    master.connect(out);

    // --- 1. roar -----------------------------------------------------------
    const roarBuf = noiseBuffer(ctx, 9, "brown", 4);
    const roar = this.keep(loopSource(ctx, roarBuf, 1, rand(0, 9)));
    const roarLp = this.keep(biquad(ctx, "lowpass", 420, 0.6));
    const roarGain = this.keep(gainNode(ctx, 0.32));
    roar.connect(roarLp).connect(roarGain).connect(master);

    // --- 2. wash -----------------------------------------------------------
    // Two sources, different buffer lengths and rates, so the composite has no
    // usable period.
    const washBuf = noiseBuffer(ctx, 7, "white", 2);
    const washBuf2 = noiseBuffer(ctx, 5, "white", 2);
    const wash1 = this.keep(loopSource(ctx, washBuf, 1.0, rand(0, 7)));
    const wash2 = this.keep(loopSource(ctx, washBuf2, 0.83, rand(0, 5)));
    const washBp = this.keep(biquad(ctx, "bandpass", 1900, 0.45));
    const washGain = this.keep(gainNode(ctx, 0.3));
    wash1.connect(washBp);
    wash2.connect(washBp);
    washBp.connect(washGain).connect(master);

    // --- 3. patter ---------------------------------------------------------
    const patter = this.keep(loopSource(ctx, patterBuffer(ctx, 12, 2200, 2), 1, rand(0, 12)));
    const patterHp = this.keep(biquad(ctx, "highpass", 900, 0.6));
    const patterLp = this.keep(biquad(ctx, "lowpass", 6500, 0.7));
    const patterGain = this.keep(gainNode(ctx, 0.26));
    patter.connect(patterHp).connect(patterLp).connect(patterGain).connect(master);

    // --- intensity drift ---------------------------------------------------
    // Rain gets heavier and lighter. Driven by random targets rather than an
    // LFO so it never settles into a recognisable breathing rhythm.
    this.addStream(
      ctx,
      (t) => {
        const intensity = rand(0, 1);
        washBp.frequency.setTargetAtTime(1300 + intensity * 1400, t, 3.5);
        washGain.gain.setTargetAtTime(0.2 + intensity * 0.2, t, 4.0);
        patterGain.gain.setTargetAtTime(0.17 + intensity * 0.19, t, 4.0);
        roarGain.gain.setTargetAtTime(0.24 + intensity * 0.16, t, 5.0);
        return rand(9, 22);
      },
      0.5,
      2,
    );

    // --- 4. drips ----------------------------------------------------------
    // Outdoor drops are near-field: mostly dry, with a short send for a hint of
    // the surface they land on.
    this.dripVerb = this.keep(
      makeReverb(ctx, { seconds: 0.8, decay: 3.5, predelay: 0.006, damping: 0.6 }),
    );
    const dripWet = this.keep(gainNode(ctx, 0.22));
    this.dripBus = this.keep(gainNode(ctx, 1));
    this.dripBus.connect(master);
    this.dripBus.connect(this.dripVerb).connect(dripWet).connect(master);

    this.addStream(ctx, (t) => this.spawnDrip(ctx, t), 1.5, 4);

    // --- distant swell -----------------------------------------------------
    // A slow sub-200 Hz rise and fall every minute or two. No crack, nothing
    // startling; it exists so a 25 minute session has some long-form shape.
    const swellSrc = this.keep(loopSource(ctx, roarBuf, 0.7, rand(0, 9)));
    const swellLp = this.keep(biquad(ctx, "lowpass", 170, 1.1));
    const swellGain = this.keep(gainNode(ctx, EPS));
    swellSrc.connect(swellLp).connect(swellGain).connect(master);
    this.addStream(
      ctx,
      (t) => {
        const peak = rand(0.15, 0.34);
        const rise = rand(2.5, 5);
        const hold = rand(1, 3);
        const fall = rand(4, 8);
        swellGain.gain.setTargetAtTime(peak, t, rise / 3);
        swellGain.gain.setTargetAtTime(EPS, t + rise + hold, fall / 3);
        return rise + hold + fall + rand(45, 130);
      },
      20,
      60,
    );
  }

  private spawnDrip(ctx: AudioContext, t: number): number {
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.85, 0.85);
    pan.connect(this.dripBus);

    // Contact transient: the splash, before the resonance forms.
    const noiseLen = Math.floor(ctx.sampleRate * 0.02);
    const nb = ctx.createBuffer(1, noiseLen, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) {
      nd[i] = (Math.random() * 2 - 1) * Math.exp((-9 * i) / noiseLen);
    }
    const noise = ctx.createBufferSource();
    noise.buffer = nb;
    const noiseHp = biquad(ctx, "highpass", rand(2500, 5000), 0.7);
    const noiseGain = gainNode(ctx, rand(0.03, 0.1));

    // Bubble resonance: damped sine gliding slightly upward.
    const f0 = rand(520, 2300);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(f0, t);
    osc.frequency.exponentialRampToValueAtTime(f0 * rand(1.06, 1.2), t + rand(0.01, 0.02));
    const oscGain = ctx.createGain();
    const decay = rand(0.05, 0.16);
    strike(oscGain.gain, t, rand(0.05, 0.13), decay, 0.001);

    noise.connect(noiseHp).connect(noiseGain).connect(pan);
    osc.connect(oscGain).connect(pan);

    noise.start(t);
    osc.start(t);
    osc.stop(t + decay + 0.05);
    osc.onended = () => {
      try {
        noise.disconnect();
        noiseHp.disconnect();
        noiseGain.disconnect();
        osc.disconnect();
        oscGain.disconnect();
        pan.disconnect();
      } catch {
        /* engine already disposed */
      }
    };

    // Drips arrive in loose clusters, the way runoff actually behaves.
    return Math.random() < 0.35 ? rand(0.12, 0.4) : rand(1.5, 6);
  }
}

// ---- ForestEngine ---------------------------------------------------------
//
// Wind and leaves are two layers, not one. The previous single lowpassed noise
// bed at 1.5 kHz removed everything above the cutoff, which is exactly the band
// leaf rustle lives in (roughly 2-7 kHz) — so it read as distant traffic. Here
// wind is the low body and rustle is a separate high band whose level tracks
// the gust envelope non-linearly: foliage is nearly silent in still air and
// erupts on gust peaks, so rustle follows gust^2.2 rather than gust.
//
// Birds sing in phrases. Isolated single sine beeps every few seconds read as a
// smoke detector, so each event emits a short multi-note motif from a species
// archetype, then falls silent for much longer. Each phrase also gets a
// distance, which drives level, high-frequency loss and reverb send together —
// the three cues that actually locate a sound in a wood.

interface Species {
  notes: [number, number];
  f0: [number, number];
  noteDur: [number, number];
  gap: [number, number];
  /** End/start frequency ratio per note. */
  sweep: [number, number];
  /** Alternate sweep direction note to note. */
  alternate: boolean;
  vibratoHz: number;
  /** Level of the 2nd harmonic. Pure sines sound like test tones. */
  harmonic: number;
}

const SPECIES: readonly Species[] = [
  {
    // fast warbler trill
    notes: [4, 8],
    f0: [3000, 4700],
    noteDur: [0.035, 0.07],
    gap: [0.025, 0.055],
    sweep: [0.78, 1.3],
    alternate: true,
    vibratoHz: 0,
    harmonic: 0.12,
  },
  {
    // thrush-like fluted phrase
    notes: [2, 4],
    f0: [1700, 2700],
    noteDur: [0.14, 0.28],
    gap: [0.1, 0.24],
    sweep: [1.0, 1.5],
    alternate: false,
    vibratoHz: 6,
    harmonic: 0.22,
  },
  {
    // sparrow chip
    notes: [1, 3],
    f0: [3800, 5800],
    noteDur: [0.018, 0.035],
    gap: [0.06, 0.14],
    sweep: [0.72, 0.95],
    alternate: false,
    vibratoHz: 0,
    harmonic: 0.3,
  },
  {
    // wood pigeon coo, gives the low register some company
    notes: [3, 5],
    f0: [380, 560],
    noteDur: [0.22, 0.4],
    gap: [0.12, 0.3],
    sweep: [0.94, 1.08],
    alternate: false,
    vibratoHz: 3.5,
    harmonic: 0.38,
  },
];

class ForestEngine extends AbstractEngine {
  private readonly birdDry: GainNode;
  private readonly birdVerb: ConvolverNode;

  constructor(ctx: AudioContext, out: AudioNode) {
    super();

    const master = this.keep(gainNode(ctx, 1));
    master.connect(out);

    // --- wind body ---------------------------------------------------------
    const windBuf = noiseBuffer(ctx, 9, "brown", 4);
    const wind = this.keep(loopSource(ctx, windBuf, 1, rand(0, 9)));
    const windLp = this.keep(biquad(ctx, "lowpass", 900, 1.6));
    const windGain = this.keep(gainNode(ctx, 0.34));
    wind.connect(windLp).connect(windGain).connect(master);

    // --- leaf rustle -------------------------------------------------------
    const leafBuf = noiseBuffer(ctx, 7, "white", 2);
    const leafBuf2 = noiseBuffer(ctx, 5, "white", 2);
    const leaf1 = this.keep(loopSource(ctx, leafBuf, 1.0, rand(0, 7)));
    const leaf2 = this.keep(loopSource(ctx, leafBuf2, 0.91, rand(0, 5)));
    const leafBp = this.keep(biquad(ctx, "bandpass", 3600, 0.55));
    const leafHp = this.keep(biquad(ctx, "highpass", 1800, 0.7));
    const leafGain = this.keep(gainNode(ctx, 0.05));
    leaf1.connect(leafHp);
    leaf2.connect(leafHp);
    leafHp.connect(leafBp).connect(leafGain).connect(master);

    // --- gusts -------------------------------------------------------------
    // A random walk of targets. Each gust picks a strength and a duration and
    // glides there; nothing repeats.
    this.addStream(
      ctx,
      (t) => {
        const strength = Math.pow(rand(0, 1), 1.4); // mostly gentle, rarely strong
        const attack = rand(1.8, 5.5);
        const decay = rand(3, 9);
        const tc = attack / 3;

        windLp.frequency.setTargetAtTime(520 + strength * 1250, t, tc);
        windGain.gain.setTargetAtTime(0.24 + strength * 0.3, t, tc);
        // Foliage responds superlinearly and slightly after the air movement.
        leafGain.gain.setTargetAtTime(0.02 + Math.pow(strength, 2.2) * 0.3, t + 0.35, tc);
        leafBp.frequency.setTargetAtTime(2900 + strength * 2200, t + 0.35, tc);

        // Settle back toward calm before the next gust is chosen.
        const rest = t + attack + rand(0.5, 3);
        windGain.gain.setTargetAtTime(0.24, rest, decay / 3);
        leafGain.gain.setTargetAtTime(0.03, rest, decay / 3);

        return attack + decay + rand(2, 8);
      },
      0.5,
      3,
    );

    // --- birds -------------------------------------------------------------
    // Woodland is diffuse rather than reverberant: short, heavily damped tail.
    this.birdVerb = this.keep(
      makeReverb(ctx, { seconds: 1.4, decay: 2.6, predelay: 0.025, damping: 0.62 }),
    );
    const birdWet = this.keep(gainNode(ctx, 0.5));
    this.birdDry = this.keep(gainNode(ctx, 1));
    this.birdDry.connect(master);
    this.birdVerb.connect(birdWet).connect(master);

    this.addStream(ctx, (t) => this.spawnPhrase(ctx, t), 2, 6);
  }

  private spawnPhrase(ctx: AudioContext, t: number): number {
    const sp = pick(SPECIES);
    const count = randInt(sp.notes[0], sp.notes[1]);
    const base = rand(sp.f0[0], sp.f0[1]);

    // One bird, one place, one distance, for the whole phrase.
    const distance = Math.pow(rand(0, 1), 0.7);
    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.9, 0.9);

    const tone = biquad(ctx, "lowpass", 1500 + (1 - distance) * 11000, 0.7);
    const level = gainNode(ctx, (1 - distance * 0.8) * rand(0.06, 0.11));
    const dry = gainNode(ctx, 1 - distance * 0.55);
    const wet = gainNode(ctx, 0.12 + distance * 0.5);

    tone.connect(level).connect(pan);
    pan.connect(dry).connect(this.birdDry);
    pan.connect(wet).connect(this.birdVerb);

    let cursor = t;
    let last: OscillatorNode | null = null;
    const cleanup: AudioNode[] = [];

    for (let i = 0; i < count; i++) {
      const dur = rand(sp.noteDur[0], sp.noteDur[1]);
      let ratio = rand(sp.sweep[0], sp.sweep[1]);
      if (sp.alternate && i % 2 === 1) ratio = 1 / ratio;
      const f = base * rand(0.94, 1.06);

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(f, cursor);
      osc.frequency.exponentialRampToValueAtTime(f * ratio, cursor + dur);

      const env = ctx.createGain();
      strike(env.gain, cursor, 1, dur * 0.85, Math.min(0.008, dur * 0.2));

      osc.connect(env).connect(tone);
      osc.start(cursor);
      osc.stop(cursor + dur + 0.05);
      cleanup.push(osc, env);
      last = osc;

      // Second harmonic: enough to suggest a beak, not enough to sound reedy.
      if (sp.harmonic > 0) {
        const h = ctx.createOscillator();
        h.type = "sine";
        h.frequency.setValueAtTime(f * 2, cursor);
        h.frequency.exponentialRampToValueAtTime(f * 2 * ratio, cursor + dur);
        const hg = ctx.createGain();
        strike(hg.gain, cursor, sp.harmonic, dur * 0.7, 0.006);
        h.connect(hg).connect(tone);
        h.start(cursor);
        h.stop(cursor + dur + 0.05);
        cleanup.push(h, hg);
      }

      if (sp.vibratoHz > 0) {
        const vib = ctx.createOscillator();
        vib.type = "sine";
        vib.frequency.value = sp.vibratoHz;
        const vibAmt = ctx.createGain();
        vibAmt.gain.value = f * 0.012;
        vib.connect(vibAmt).connect(osc.frequency);
        vib.start(cursor);
        vib.stop(cursor + dur + 0.05);
        cleanup.push(vib, vibAmt);
      }

      cursor += dur + rand(sp.gap[0], sp.gap[1]);
    }

    if (last) {
      last.onended = () => {
        for (const n of [...cleanup, tone, level, dry, wet, pan]) {
          try {
            n.disconnect();
          } catch {
            /* engine already disposed */
          }
        }
      };
    }

    const phraseLength = cursor - t;
    // Birds answer each other: sometimes a quick reply, usually a long pause.
    return phraseLength + (Math.random() < 0.3 ? rand(0.6, 2.5) : rand(7, 26));
  }
}

// ---- CafeEngine -----------------------------------------------------------
//
// The babble is four independent voices, not one filtered noise source. The
// previous version fed three static formant filters from a single noise buffer
// and modulated the sum with one sine, so every "voice" was perfectly
// correlated with every other — acoustically that is one very large mouth
// holding one vowel forever, which is why it read as hiss.
//
// Each voice here has its own noise source, its own vocal-tract scale, its own
// pan, and its own syllable clock. Every syllable retargets the three formants
// to a new vowel with a short glide, which is what coarticulated speech
// actually does. Voices talk for a while, then pause.
//
// The excitation stays unvoiced (noise, no glottal oscillator) on purpose. Add
// a pitched source and the babble acquires a pitch centre and starts to sound
// like a specific person talking, which the language centres will try to parse.
// Unintelligible whisper-babble is the point: present, but nothing to decode.

/** Peterson & Barney style F1/F2/F3 centres, scaled per voice. */
const VOWELS: readonly (readonly [number, number, number])[] = [
  [730, 1090, 2440], // a
  [530, 1840, 2480], // e
  [270, 2290, 3010], // i
  [570, 840, 2410], // o
  [300, 870, 2240], // u
  [500, 1500, 2500], // schwa
  [660, 1720, 2410], // ae
];

const FORMANT_Q = [5, 7, 9];
const FORMANT_GAIN = [1.0, 0.5, 0.22];

class CafeEngine extends AbstractEngine {
  private readonly clinkBus: GainNode;
  private readonly roomVerb: ConvolverNode;

  constructor(ctx: AudioContext, out: AudioNode) {
    super();

    // 4.5 kHz was too dark — it removed the crockery presence that makes a café
    // sound like a room with objects in it. Sit higher and use a gentle shelf.
    const master = this.keep(biquad(ctx, "lowpass", 7000, 0.5));
    const tilt = this.keep(biquad(ctx, "highshelf", 3500, 0.7, -4));
    master.connect(tilt).connect(out);

    // --- room tone ---------------------------------------------------------
    // Ventilation and the low sum of a full room. Without this the mix has no
    // floor and the babble sounds thin and hissy.
    const roomBuf = noiseBuffer(ctx, 8, "brown", 4);
    const room = this.keep(loopSource(ctx, roomBuf, 1, rand(0, 8)));
    const roomLp = this.keep(biquad(ctx, "lowpass", 230, 0.7));
    const roomGain = this.keep(gainNode(ctx, 0.3));
    room.connect(roomLp).connect(roomGain).connect(master);

    // --- room reverb -------------------------------------------------------
    this.roomVerb = this.keep(
      makeReverb(ctx, { seconds: 1.3, decay: 2.2, predelay: 0.014, damping: 0.45 }),
    );
    const wetGain = this.keep(gainNode(ctx, 0.4));
    this.roomVerb.connect(wetGain).connect(master);

    // --- babble ------------------------------------------------------------
    const voiceBuf = noiseBuffer(ctx, 6, "pink", 2);
    const voiceCount = 4;
    for (let i = 0; i < voiceCount; i++) {
      this.buildVoice(ctx, voiceBuf, master, i, voiceCount);
    }

    // --- crockery ----------------------------------------------------------
    this.clinkBus = this.keep(gainNode(ctx, 1));
    this.clinkBus.connect(master);
    this.clinkBus.connect(this.roomVerb);
    this.addStream(ctx, (t) => this.spawnClink(ctx, t), 2, 5);

    // --- espresso machine --------------------------------------------------
    const steamBuf = noiseBuffer(ctx, 4, "white", 2);
    const steam = this.keep(loopSource(ctx, steamBuf, 1, rand(0, 4)));
    const steamBp = this.keep(biquad(ctx, "bandpass", 3200, 0.9));
    const steamGain = this.keep(gainNode(ctx, EPS));
    steam.connect(steamBp).connect(steamGain).connect(master);
    steamGain.connect(this.roomVerb);

    this.addStream(
      ctx,
      (t) => {
        const hold = rand(1.2, 3.2);
        const peak = rand(0.02, 0.05);
        steamGain.gain.setTargetAtTime(peak, t, 0.12);
        // Frothing milk climbs in pitch as the jug fills.
        steamBp.frequency.setValueAtTime(2600, t);
        steamBp.frequency.linearRampToValueAtTime(rand(3800, 4800), t + hold);
        steamGain.gain.setTargetAtTime(EPS, t + hold, 0.18);
        return hold + rand(50, 150);
      },
      25,
      70,
    );
  }

  /** One talker: own excitation, own vocal tract, own syllable clock. */
  private buildVoice(
    ctx: AudioContext,
    buf: AudioBuffer,
    master: AudioNode,
    index: number,
    total: number,
  ): void {
    // Decorrelate by both playback rate and start offset, so no two voices ever
    // share a sample of excitation.
    const src = this.keep(loopSource(ctx, buf, rand(0.86, 1.14), (index / total) * buf.duration));
    const hp = this.keep(biquad(ctx, "highpass", 170, 0.7));
    src.connect(hp);

    // Vocal tract length: below 1 reads larger/deeper, above 1 smaller/higher.
    const scale = rand(0.82, 1.32);

    const syllable = this.keep(gainNode(ctx, 0.05));
    const bands = FORMANT_Q.map((q, i) => {
      const bp = this.keep(biquad(ctx, "bandpass", VOWELS[0][i] * scale, q));
      const g = this.keep(gainNode(ctx, FORMANT_GAIN[i]));
      hp.connect(bp).connect(g).connect(syllable);
      return bp;
    });

    const pan = this.keep(ctx.createStereoPanner());
    // Spread the voices across the field instead of stacking them centre.
    pan.pan.value = (index / (total - 1)) * 1.5 - 0.75 + rand(-0.12, 0.12);

    const level = this.keep(gainNode(ctx, 0.16 / Math.sqrt(total)));
    const dry = this.keep(gainNode(ctx, 0.45));
    const send = this.keep(gainNode(ctx, 0.9));
    syllable.connect(pan).connect(level);
    level.connect(dry).connect(master);
    level.connect(send).connect(this.roomVerb);

    let remaining = randInt(6, 22);
    let speaking = true;

    this.addStream(
      ctx,
      (t) => {
        if (!speaking) {
          speaking = true;
          remaining = randInt(6, 22);
        }
        const v = pick(VOWELS);
        for (let i = 0; i < bands.length; i++) {
          // ~35 ms glide: coarticulation, not stepping between vowels.
          bands[i].frequency.setTargetAtTime(v[i] * scale, t, 0.035);
        }
        syllable.gain.setTargetAtTime(rand(0.25, 1.0), t, 0.025);

        remaining -= 1;
        if (remaining <= 0) {
          speaking = false;
          syllable.gain.setTargetAtTime(0.03, t + rand(0.08, 0.2), 0.12);
          return rand(0.9, 4.5);
        }
        // 4.5-12 syllables per second, the natural range for conversation.
        return rand(0.085, 0.22);
      },
      rand(0, 1.5),
      rand(1.5, 3),
    );
  }

  private spawnClink(ctx: AudioContext, t: number): number {
    // Ceramic mug vs glass: different pitch centre and, more importantly,
    // different ring time. The previous 30-80 ms decay produced a tick, not a
    // clink — struck crockery rings for hundreds of milliseconds.
    const glass = Math.random() < 0.35;
    const f0 = glass ? rand(2400, 4200) : rand(1300, 2500);
    const ring = glass ? rand(0.5, 1.4) : rand(0.22, 0.7);
    const ratios = glass ? [1, 2.71, 5.15, 8.4] : [1, 1.59, 2.14, 2.97];
    const modeGain = [1, 0.5, 0.28, 0.13];
    const modeDecay = [1, 0.62, 0.4, 0.26];
    const amp = rand(0.03, 0.09);

    const pan = ctx.createStereoPanner();
    pan.pan.value = rand(-0.75, 0.75);
    const mix = gainNode(ctx, 1);
    mix.connect(pan).connect(this.clinkBus);

    const parts: AudioNode[] = [mix, pan];

    // Contact noise: without it the modes fade in and sound like a bell pad.
    const nLen = Math.floor(ctx.sampleRate * 0.012);
    const nb = ctx.createBuffer(1, nLen, ctx.sampleRate);
    const nd = nb.getChannelData(0);
    for (let i = 0; i < nLen; i++) {
      nd[i] = (Math.random() * 2 - 1) * Math.exp((-14 * i) / nLen);
    }
    const strikeSrc = ctx.createBufferSource();
    strikeSrc.buffer = nb;
    const strikeHp = biquad(ctx, "highpass", 3000, 0.7);
    const strikeGain = gainNode(ctx, amp * 0.55);
    strikeSrc.connect(strikeHp).connect(strikeGain).connect(mix);
    strikeSrc.start(t);
    parts.push(strikeSrc, strikeHp, strikeGain);

    let longest: OscillatorNode | null = null;
    ratios.forEach((r, i) => {
      const osc = ctx.createOscillator();
      osc.type = "sine";
      // Slight inharmonic scatter: real objects are not perfectly symmetrical.
      osc.frequency.value = f0 * r * rand(0.995, 1.005);
      const env = ctx.createGain();
      const d = ring * modeDecay[i];
      strike(env.gain, t, amp * modeGain[i], d, 0.0015);
      osc.connect(env).connect(mix);
      osc.start(t);
      osc.stop(t + d + 0.05);
      parts.push(osc, env);
      if (i === 0) longest = osc;
    });

    if (longest) {
      (longest as OscillatorNode).onended = () => {
        for (const n of parts) {
          try {
            n.disconnect();
          } catch {
            /* engine already disposed */
          }
        }
      };
    }

    // Crockery clusters: a cup set down is often followed by a saucer.
    return Math.random() < 0.3 ? rand(0.15, 0.6) : rand(4, 13);
  }
}

// ---- host -----------------------------------------------------------------

interface Host {
  ctx: AudioContext;
  master: GainNode;
  limiter: DynamicsCompressorNode;
}

let host: Host | null = null;
let current: Engine | null = null;
let currentPreset: AmbientPreset | null = null;
let stopTimer: ReturnType<typeof setTimeout> | null = null;
let detachGesture: (() => void) | null = null;
let volume = 0.7;

function buildEngine(ctx: AudioContext, out: AudioNode, preset: AmbientPreset): Engine | null {
  switch (preset) {
    case "rain":
      return new RainEngine(ctx, out);
    case "forest":
      return new ForestEngine(ctx, out);
    case "cafe":
      return new CafeEngine(ctx, out);
    default:
      return null;
  }
}

function createHost(): Host | null {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;

  // 'playback' asks for a larger render buffer: fewer glitches and materially
  // lower CPU than the interactive default, and latency is irrelevant here.
  const ctx = new Ctor({ latencyHint: "playback" });

  // Soft limiter. The beds are steady, but drips, clinks and bird phrases are
  // transients that can stack; this keeps peaks off the ceiling without the
  // audible pumping a harder ratio would cause.
  const limiter = ctx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 8;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  const master = ctx.createGain();
  master.gain.value = EPS;
  master.connect(limiter).connect(ctx.destination);

  return { ctx, master, limiter };
}

/**
 * Browsers only allow audio to start from a user gesture. If resume() does not
 * take, arm a one-shot listener so the sound comes up on the next interaction
 * instead of silently never starting.
 */
function ensureRunning(ctx: AudioContext): void {
  detachGesture?.();
  detachGesture = null;

  void ctx.resume().catch(() => {
    /* will retry on gesture */
  });
  if (ctx.state === "running") return;

  const events: readonly string[] = ["pointerdown", "keydown", "touchstart"];
  const onGesture = () => {
    void ctx.resume().catch(() => {
      /* noop */
    });
    detachGesture?.();
    detachGesture = null;
  };
  for (const e of events) window.addEventListener(e, onGesture, { once: true, passive: true });
  detachGesture = () => {
    for (const e of events) window.removeEventListener(e, onGesture);
  };
}

function targetGain(preset: AmbientPreset): number {
  return Math.max(EPS, volume * (PRESET_TRIM[preset] ?? 1));
}

/**
 * Start the named ambient preset. Idempotent: the same preset while already
 * running is a no-op; a different preset swaps engines cleanly. `'none'` stops
 * any running sound. Safe to call when Web Audio is unavailable.
 */
export function startAmbient(preset: AmbientPreset): void {
  if (currentPreset === preset && current !== null) return;

  // Cancel a stop that is still fading out.
  if (stopTimer !== null) {
    clearTimeout(stopTimer);
    stopTimer = null;
  }

  if (current) {
    current.dispose();
    current = null;
  }

  if (preset === "none") {
    stopAmbient();
    return;
  }

  try {
    if (host && host.ctx.state === "closed") host = null;
    if (!host) host = createHost();
    if (!host) return;

    ensureRunning(host.ctx);

    const engine = buildEngine(host.ctx, host.master, preset);
    if (!engine) return;

    current = engine;
    currentPreset = preset;

    // Fade in. Building the graph takes a few ms of noise generation, so ramp
    // from the current value rather than assuming silence.
    const g = host.master.gain;
    const now = host.ctx.currentTime;
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(g.value, EPS), now);
    g.exponentialRampToValueAtTime(targetGain(preset), now + FADE_IN_S);
  } catch {
    currentPreset = null;
    /* no audio support */
  }
}

/**
 * Stop ambient sound and tear everything down. Idempotent. Fades out first so
 * there is no click, then disposes and suspends the context for reuse.
 */
export function stopAmbient(): void {
  currentPreset = null;
  detachGesture?.();
  detachGesture = null;

  if (!host) {
    current?.dispose();
    current = null;
    return;
  }

  const { ctx, master } = host;
  const now = ctx.currentTime;
  const g = master.gain;
  try {
    g.cancelScheduledValues(now);
    g.setValueAtTime(Math.max(g.value, EPS), now);
    g.exponentialRampToValueAtTime(EPS, now + FADE_OUT_S);
  } catch {
    /* param already detached */
  }

  if (stopTimer !== null) clearTimeout(stopTimer);
  stopTimer = setTimeout(
    () => {
      stopTimer = null;
      current?.dispose();
      current = null;
      void host?.ctx.suspend().catch(() => {
        /* noop */
      });
    },
    FADE_OUT_S * 1000 + 60,
  );
}

/** Set output level, 0-1. Applies immediately with a short ramp. */
export function setAmbientVolume(next: number): void {
  volume = Math.min(1, Math.max(0, next));
  if (!host || !currentPreset) return;
  const now = host.ctx.currentTime;
  const g = host.master.gain;
  g.cancelScheduledValues(now);
  g.setValueAtTime(Math.max(g.value, EPS), now);
  g.exponentialRampToValueAtTime(targetGain(currentPreset), now + 0.15);
}

/** The preset currently sounding, or null. */
export function currentAmbientPreset(): AmbientPreset | null {
  return currentPreset;
}