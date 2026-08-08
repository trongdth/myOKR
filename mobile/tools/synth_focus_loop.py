#!/usr/bin/env python3
"""Offline-render the focus-music loop as a bundled WAV asset (ADR-0005).

Desktop generates ambient music LIVE via the Web Audio API (a fixed Am–F–C–G
synth pad). Flutter has no Web Audio, so per ADR-0005 we ship a short OFFLINE
render of that same four-chord progression and loop it. This script synthesizes
that loop deterministically with the Python standard library only (no numpy):

  Am  ->  F  ->  C  ->  G    (one bar each, crossfaded, low-passed, normalized)

It is deliberately NOT a bit-identical clone of desktop's generative output
(desktop adds an arpeggio pluck, dotted-eighth echo, and a live scheduler).
ADR-0005 accepts that loss: desktop's loop "is intentionally predictable — the
same 4-chord loop repeats". A soft, looping four-chord pad is the intent.

Run:  python3 tools/synth_focus_loop.py
Out:  assets/audio/focus_loop.wav   (44.1kHz mono 16-bit PCM)
"""
import math
import os
import struct
import wave

SAMPLE_RATE = 44100
CHORD_SECONDS = 4.0           # one bar per chord
CHORDS = [
    # (root, third, fifth) in Hz — Am, F, C, G
    (220.00, 261.63, 329.63),  # A minor: A3, C4, E4
    (174.61, 220.00, 261.63),  # F major: F3, A3, C4
    (261.63, 329.63, 392.00),  # C major: C4, E4, G4
    (196.00, 246.94, 293.66),  # G major: G3, B3, D4
]
FADE_IN = 0.4                 # seconds — soft attack per chord (crossfade feel)
FADE_OUT = 0.6                # seconds — soft release per chord
PEAK = 0.45                   # leave headroom; this is background ambient audio


def chord_sample(freqs, t_within_chord):
    """Sum of soft-sine tones + a sub octave for body. Detuned partials add warmth."""
    total = 0.0
    for f in freqs:
        # Two slightly detuned sine partials per tone -> gentle chorus/warmth.
        total += math.sin(math.tau * f * t_within_chord)
        total += 0.25 * math.sin(math.tau * (f * 1.003) * t_within_chord)
    # Sub octave off the root for pad body.
    total += 0.35 * math.sin(math.tau * (freqs[0] / 2.0) * t_within_chord)
    return total


def envelope(t_within_chord, chord_len):
    """Attack/release fade so chord boundaries don't click."""
    if t_within_chord < FADE_IN:
        return t_within_chord / FADE_IN
    if t_within_chord > chord_len - FADE_OUT:
        return max(0.0, (chord_len - t_within_chord) / FADE_OUT)
    return 1.0


def low_pass(samples, k=3):
    """Trivial moving-average low-pass to take the edge off the sines."""
    out = []
    buf = [0.0] * k
    running = 0.0
    for s in samples:
        running += s - buf.pop(0)
        buf.append(s)
        out.append(running / k)
    return out


def main():
    chord_len = CHORD_SECONDS
    total_seconds = chord_len * len(CHORDS)
    n = int(total_seconds * SAMPLE_RATE)
    samples = [0.0] * n
    dt = 1.0 / SAMPLE_RATE
    for ci, freqs in enumerate(CHORDS):
        start = ci * chord_len
        start_idx = int(start * SAMPLE_RATE)
        len_idx = int(chord_len * SAMPLE_RATE)
        for i in range(len_idx):
            t_abs = (start_idx + i) * dt
            t_within = t_abs - start
            samples[start_idx + i] = chord_sample(freqs, t_within) * envelope(t_within, chord_len)

    samples = low_pass(samples, k=4)

    # Normalize to PEAK so summing many sines never clips.
    peak = max(abs(s) for s in samples) or 1.0
    scale = PEAK / peak
    samples = [max(-1.0, min(1.0, s * scale)) for s in samples]

    out_dir = os.path.join(os.path.dirname(__file__), "..", "assets", "audio")
    os.makedirs(out_dir, exist_ok=True)
    out_path = os.path.join(out_dir, "focus_loop.wav")
    with wave.open(out_path, "wb") as w:
        w.setnchannels(1)
        w.setsampwidth(2)  # 16-bit
        w.setframerate(SAMPLE_RATE)
        frames = bytearray()
        for s in samples:
            frames += struct.pack("<h", int(s * 32767))
        w.writeframes(bytes(frames))

    size = os.path.getsize(out_path)
    print(f"wrote {out_path}  ({total_seconds:.0f}s, {size/1024:.0f} KB)")


if __name__ == "__main__":
    main()
