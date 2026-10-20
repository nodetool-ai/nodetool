#!/usr/bin/env python3
"""Synthesizes Kindle's water splash, brazier ignition, ember chime and title start cue.

Run: python3 synthesize_audio.py <out-dir>
Every sound is seeded, so a rerun writes identical 44.1 kHz 16-bit mono WAV files.
"""
import sys
import wave
from pathlib import Path

import numpy as np

RATE = 44100
OUT = Path(sys.argv[1] if len(sys.argv) > 1 else "out")
OUT.mkdir(parents=True, exist_ok=True)
rng = np.random.default_rng(11)


def seconds(duration):
    return np.arange(int(RATE * duration)) / RATE


def lowpass(signal, cutoff):
    """One-pole low-pass; `cutoff` may be an array for a sweep."""
    cutoff = np.broadcast_to(np.asarray(cutoff, dtype=np.float64), signal.shape)
    alpha = 1 - np.exp(-2 * np.pi * cutoff / RATE)
    out = np.empty_like(signal)
    state = 0.0
    for i, (x, a) in enumerate(zip(signal, alpha)):
        state += a * (x - state)
        out[i] = state
    return out


def highpass(signal, cutoff):
    return signal - lowpass(signal, cutoff)


def room(signal, decay=1.2, mix=0.25):
    """A small feedback-delay reverb for a stone chamber."""
    delays = [1557, 1617, 1491, 1422, 1277, 1356]
    tail = np.zeros(len(signal) + int(RATE * decay))
    padded = np.concatenate([signal, np.zeros(len(tail) - len(signal))])
    for delay in delays:
        gain = 10 ** (-3 * delay / (RATE * decay))
        line = np.zeros_like(tail)
        for i in range(delay, len(tail)):
            line[i] = padded[i - delay] + gain * line[i - delay]
        tail += line / len(delays)
    return padded * (1 - mix) + lowpass(tail, 5000) * mix


def write(name, signal, peak=0.89):
    signal = signal / max(1e-9, np.max(np.abs(signal))) * peak
    # Drop the reverb tail once it falls below -54 dBFS.
    audible = np.nonzero(np.abs(signal) > 10 ** (-54 / 20))[0]
    signal = signal[:audible[-1] + 1] if len(audible) else signal
    fade = min(len(signal), int(RATE * 0.01))
    signal[-fade:] *= np.linspace(1, 0, fade)
    data = (signal * 32767).astype("<i2")
    with wave.open(str(OUT / name), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes(data.tobytes())


def splash():
    """The hero falling into cursed water: a hiss that sinks, then bubbles."""
    t = seconds(0.9)
    noise = rng.standard_normal(len(t))
    body = lowpass(noise, 4200 * np.exp(-t * 5) + 250) * np.exp(-t * 6)
    plop = np.sin(2 * np.pi * (180 * np.exp(-t * 9) + 70) * t) * np.exp(-t * 14)
    bubbles = np.zeros_like(t)
    for _ in range(9):
        start = rng.uniform(0.12, 0.7)
        frequency = rng.uniform(500, 1100)
        local = np.clip(t - start, 0, None)
        bubbles += np.sin(2 * np.pi * frequency * (1 + 1.8 * local) * local) * np.exp(-local * 40) * (t > start) * 0.35
    write("splash.wav", room(body * 0.9 + plop * 0.7 + bubbles, 1.4, 0.3))


def ignite():
    """A brazier catching: a rising whoosh, a low thump and crackle."""
    t = seconds(1.8)
    noise = rng.standard_normal(len(t))
    swell = np.clip(t / 0.25, 0, 1) * np.exp(-np.clip(t - 0.25, 0, None) * 3.2)
    whoosh = lowpass(noise, 300 + 2600 * np.clip(t / 0.3, 0, 1)) * swell
    thump = np.sin(2 * np.pi * (90 * np.exp(-t * 6) + 42) * t) * np.exp(-t * 7) * (t > 0.18)
    crackle = np.zeros_like(t)
    for _ in range(40):
        start = rng.uniform(0.22, 1.6)
        index = int(start * RATE)
        length = int(RATE * rng.uniform(0.002, 0.006))
        crackle[index:index + length] += rng.standard_normal(min(length, len(t) - index)) * rng.uniform(0.2, 0.6) * np.exp(-(start - 0.22) * 1.5)
    bell = sum(np.sin(2 * np.pi * f * t) * np.exp(-t * d) * a for f, d, a in [(523.25, 2.2, 0.20), (783.99, 2.8, 0.14), (1046.5, 3.5, 0.09)])
    write("ignite.wav", room(whoosh * 0.8 + thump * 0.9 + highpass(crackle, 1500) + bell * (t > 0.2), 2.4, 0.35))


def chime():
    """An ember gathered: a bright two-note glass tone."""
    t = seconds(0.9)
    tone = np.zeros_like(t)
    for start, base in [(0.0, 1318.5), (0.06, 1975.5)]:
        local = np.clip(t - start, 0, None)
        for ratio, amp in [(1, 0.6), (2.76, 0.18), (5.4, 0.07)]:
            tone += np.sin(2 * np.pi * base * ratio * local) * np.exp(-local * (7 + ratio * 2)) * amp * (t >= start)
    shimmer = highpass(rng.standard_normal(len(t)), 6000) * np.exp(-t * 30) * 0.12
    write("chime.wav", room(tone + shimmer, 1.6, 0.35), 0.8)


def start():
    """Title confirm: a soft rising breath with a warm tone."""
    t = seconds(1.3)
    noise = lowpass(rng.standard_normal(len(t)), 400 + 3000 * np.clip(t / 0.6, 0, 1))
    env = np.clip(t / 0.5, 0, 1) * np.exp(-np.clip(t - 0.5, 0, None) * 4)
    tone = sum(np.sin(2 * np.pi * f * t) * a for f, a in [(220, 0.4), (329.6, 0.25), (440, 0.15)]) * env
    write("start.wav", room(noise * env * 0.6 + tone, 2.0, 0.35), 0.75)


splash()
ignite()
chime()
start()
print("synthesized", sorted(path.name for path in OUT.glob("*.wav")))
