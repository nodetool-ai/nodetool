#!/usr/bin/env python3
"""Synthesizes the BLACKSITE sound effects and score loop with NumPy.

Run from the repository root:

    python3 packages/game-runtime/samples/blacksite/tools/synthesize_audio.py OUT_DIR

Writes 48 kHz mono WAV effects and `score.wav`, a seamless 48-second loop.
Encode the loop with `ffmpeg -i score.wav -c:a libvorbis -q:a 4 score.ogg`.
Every generator uses a fixed seed, so the output is reproducible.
"""
import sys
import wave
from pathlib import Path

import numpy as np

RATE = 48000


def seconds(duration):
    return np.arange(int(duration * RATE)) / RATE


def noise(duration, seed):
    return np.random.default_rng(seed).standard_normal(int(duration * RATE))


def noise_samples(count, seed):
    return np.random.default_rng(seed).standard_normal(count)


def spectral(signal, response):
    """Filters `signal` by a magnitude response sampled on rfft bins."""
    spectrum = np.fft.rfft(signal)
    frequencies = np.fft.rfftfreq(len(signal), 1 / RATE)
    return np.fft.irfft(spectrum * response(frequencies), len(signal))


def lowpass(signal, cutoff, order=2):
    return spectral(signal, lambda f: 1 / np.sqrt(1 + (f / cutoff) ** (2 * order)))


def highpass(signal, cutoff, order=2):
    return spectral(signal, lambda f: 1 / np.sqrt(1 + (cutoff / np.maximum(f, 1e-3)) ** (2 * order)))


def bandpass(signal, low, high, order=2):
    return highpass(lowpass(signal, high, order), low, order)


def sweep(start, end, duration, curve=1.0):
    """Sine whose frequency moves from start to end with an exponential path."""
    t = seconds(duration)
    progress = (t / duration) ** curve
    frequency = start * (end / start) ** progress
    return np.sin(2 * np.pi * np.cumsum(frequency) / RATE)


def envelope(duration, attack, decay):
    t = seconds(duration)
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def room(signal, size=0.9, mix=0.22, seed=7):
    """Adds a short metallic room tail by convolving with decaying noise."""
    tail = noise(size, seed) * np.exp(-seconds(size) / (size / 5))
    tail = lowpass(tail, 5200)
    length = len(signal) + len(tail)
    wet = np.fft.irfft(np.fft.rfft(signal, length) * np.fft.rfft(tail, length), length)
    wet /= np.max(np.abs(wet)) + 1e-9
    dry = np.concatenate([signal, np.zeros(len(tail))])[: len(wet)]
    return dry + wet * mix * np.max(np.abs(signal))


def fade(signal, tail=0.01):
    count = int(tail * RATE)
    signal = signal.copy()
    signal[-count:] *= np.linspace(1, 0, count)
    return signal


def normalize(signal, peak_db=-1.0):
    return signal / (np.max(np.abs(signal)) + 1e-9) * 10 ** (peak_db / 20)


def pad(signal, duration):
    out = np.zeros(int(duration * RATE))
    out[: len(signal)] = signal[: len(out)]
    return out


def write(path, signal, peak_db=-1.0):
    data = np.clip(normalize(fade(signal), peak_db), -1, 1)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes((data * 32767).astype("<i2").tobytes())


def rifle_shot():
    duration = 0.55
    crack = pad(highpass(noise(0.012, 1), 2500) * envelope(0.012, 0.0002, 0.003), duration)
    body = pad(bandpass(noise(0.3, 2), 180, 4200) * envelope(0.3, 0.001, 0.045), duration)
    thump = pad(sweep(110, 42, 0.18, 0.5) * envelope(0.18, 0.001, 0.05), duration)
    pulse = pad(sweep(1600, 240, 0.09, 0.6) * envelope(0.09, 0.0005, 0.03), duration)
    mechanism = pad(np.zeros(int(0.045 * RATE)), duration)
    clack = highpass(noise(0.03, 3), 3000) * envelope(0.03, 0.0005, 0.006)
    mechanism[int(0.05 * RATE): int(0.05 * RATE) + len(clack)] += clack
    shot = 0.9 * crack + 0.85 * body + 1.1 * thump + 0.28 * pulse + 0.25 * mechanism
    return room(np.tanh(shot * 1.6), 0.5, 0.35)[: int(duration * RATE)]


def reload_sequence():
    duration = 1.15
    out = np.zeros(int(duration * RATE))

    def place(at, sound, gain):
        start = int(at * RATE)
        out[start: start + len(sound)] += gain * sound[: len(out) - start]

    def click(seed, low, high, decay):
        return bandpass(noise(0.08, seed), low, high) * envelope(0.08, 0.0003, decay)

    def ring(frequencies, decay, length=0.25):
        t = seconds(length)
        return sum(np.sin(2 * np.pi * f * t) / (index + 1) for index, f in enumerate(frequencies)) * np.exp(-t / decay)

    place(0.02, click(11, 900, 6000, 0.012), 0.8)
    place(0.03, ring([1850, 2930, 4410], 0.03), 0.25)
    place(0.18, bandpass(noise(0.16, 12), 400, 3000) * envelope(0.16, 0.02, 0.05), 0.35)
    place(0.55, click(13, 300, 3500, 0.02), 1.0)
    place(0.555, sweep(140, 70, 0.12) * envelope(0.12, 0.001, 0.03), 0.7)
    place(0.84, bandpass(noise(0.12, 14), 1200, 7000) * envelope(0.12, 0.01, 0.03), 0.5)
    place(0.95, click(15, 1500, 9000, 0.01), 1.0)
    place(0.95, ring([2350, 3720, 5180], 0.05), 0.3)
    return room(out, 0.35, 0.18)[: len(out)]


def drone_charge():
    duration = 0.7
    t = seconds(duration)
    whine = sweep(320, 1900, duration, 1.6) * (0.6 + 0.4 * np.sin(2 * np.pi * 28 * t))
    hum = np.sin(2 * np.pi * 95 * t) * 0.4
    grit = bandpass(noise(duration, 21), 2000, 8000) * 0.12
    shape = np.minimum(1, t / 0.5) * np.minimum(1, (duration - t) / 0.05)
    return (whine + hum + grit) * shape


def drone_fire():
    duration = 0.6
    t = seconds(duration)
    modulator = np.sin(2 * np.pi * 63 * t) * 6
    carrier_frequency = 2400 * (180 / 2400) ** ((t / 0.35).clip(0, 1) ** 0.5)
    zap = np.sin(2 * np.pi * np.cumsum(carrier_frequency) / RATE + modulator)
    zap *= envelope(duration, 0.002, 0.12)
    crack = highpass(noise(duration, 22), 3000) * envelope(duration, 0.0005, 0.02)
    sub = sweep(90, 40, duration) * envelope(duration, 0.002, 0.08)
    return room(np.tanh(1.4 * (zap + 0.4 * crack + 0.6 * sub)), 0.6, 0.3)[: len(t)]


def hit_confirm():
    duration = 0.22
    t = seconds(duration)
    tone = sum(np.sin(2 * np.pi * f * t) * a for f, a in [(2100, 1.0), (3370, 0.6), (5240, 0.35), (7010, 0.2)])
    tick = highpass(noise(duration, 31), 4000) * envelope(duration, 0.0002, 0.004)
    return tone * envelope(duration, 0.0005, 0.035) + 0.6 * tick


def hurt():
    duration = 0.5
    thud = sweep(160, 45, duration, 0.4) * envelope(duration, 0.001, 0.07)
    crunch = bandpass(noise(duration, 41), 300, 2500) * envelope(duration, 0.001, 0.05)
    hiss = highpass(noise(duration, 42), 5000) * envelope(duration, 0.02, 0.12) * 0.25
    return np.tanh(2.2 * (thud + 0.7 * crunch + hiss))


def explosion():
    duration = 2.2
    t = seconds(duration)
    base = noise(duration, 51)
    rumble = lowpass(base, 160, 3) * envelope(duration, 0.004, 0.5) * 3.0
    blast = lowpass(base, 2400, 2) * envelope(duration, 0.001, 0.12)
    boom = sweep(70, 28, duration, 0.4) * envelope(duration, 0.002, 0.35) * 1.4
    crackle = np.zeros(len(t))
    rng = np.random.default_rng(52)
    for _ in range(46):
        at = int(rng.uniform(0.03, 1.1) * RATE)
        length = int(rng.uniform(0.004, 0.02) * RATE)
        crackle[at: at + length] += highpass(noise_samples(length, int(rng.integers(1000))), 1500) * rng.uniform(0.2, 0.7) \
            * np.exp(-at / RATE / 0.5)
    debris = bandpass(noise(duration, 53), 2500, 9000) * envelope(duration, 0.15, 0.4) * 0.15
    mix = np.tanh(1.3 * (rumble + blast + boom + 0.6 * crackle + debris))
    return room(mix, 1.2, 0.35)[: len(t)]


def dry_fire():
    duration = 0.12
    return bandpass(noise(duration, 61), 1800, 9000) * envelope(duration, 0.0003, 0.008)


def victory():
    duration = 3.6
    t = seconds(duration)
    chord = np.zeros(len(t))
    for index, f in enumerate([110, 164.81, 220, 277.18, 329.63, 440]):
        onset = index * 0.05
        local = np.clip(t - onset, 0, None)
        partial = sum(np.sin(2 * np.pi * f * h * local + h) / h ** 1.6 for h in range(1, 6))
        chord += partial * (t >= onset) * np.minimum(1, local / 0.4) * np.exp(-local / 1.6)
    swell = lowpass(noise(duration, 71), 900) * np.minimum(1, t / 1.0) * np.exp(-t / 1.2) * 0.6
    boom = sweep(80, 35, duration, 0.4) * envelope(duration, 0.002, 0.4)
    return room(chord + swell + boom, 1.6, 0.4)[: len(t)]


def score():
    """A seamless 48 s tension loop at 100 BPM: drone, pulse, metallic accents."""
    duration = 48.0
    t = seconds(duration)
    beat = 60 / 100
    out = np.zeros(len(t))

    # Drone: detuned saws through a slowly breathing lowpass, D minor.
    drone = np.zeros(len(t))
    for f, gain in [(36.71, 1.0), (36.9, 0.8), (55.0, 0.45), (73.42, 0.35), (87.31, 0.18)]:
        phase = (f * t) % 1
        drone += gain * (2 * phase - 1)
    breathing = 0.5 + 0.5 * np.sin(2 * np.pi * t / duration * 4 - np.pi / 2)
    low = lowpass(drone, 180)
    bright = lowpass(drone, 900)
    out += 0.55 * (low * (1 - breathing) + bright * breathing * 0.7)

    # Pulse: muted sub hits on every beat, accented on the bar.
    def add(at, sound, gain):
        start = int(at * RATE) % len(out)
        end = min(len(out), start + len(sound))
        out[start:end] += gain * sound[: end - start]
        rest = len(sound) - (end - start)
        if rest > 0:
            out[:rest] += gain * sound[end - start:]

    kick = sweep(95, 38, 0.35, 0.5) * envelope(0.35, 0.002, 0.09)
    tick = highpass(noise(0.05, 81), 6000) * envelope(0.05, 0.0005, 0.008)
    clank = bandpass(noise(0.4, 82), 600, 4000) * envelope(0.4, 0.001, 0.07)
    beats = int(duration / beat)
    for index in range(beats):
        at = index * beat
        bar = index // 4
        add(at, kick, 0.9 if index % 4 == 0 else 0.45)
        add(at + beat / 2, tick, 0.1)
        if bar >= 4 and index % 8 == 6:
            add(at + beat * 0.75, clank, 0.35)
        if bar >= 8 and index % 2 == 1:
            add(at + beat * 0.25, tick, 0.06)

    # Pulse ostinato: filtered square bass in sixteenth notes from bar 4.
    notes = [38.89, 38.89, 46.25, 38.89, 41.2, 38.89, 51.91, 46.25]
    sixteenth = beat / 4
    for index in range(int(duration / sixteenth)):
        at = index * sixteenth
        if at < beat * 16:
            continue
        f = notes[(index // 2) % len(notes)] * 2
        local = seconds(sixteenth * 0.9)
        square = np.sign(np.sin(2 * np.pi * f * local))
        note = lowpass(square, 420 + 380 * np.sin(index / 9) ** 2) * np.exp(-local / 0.07)
        add(at, note, 0.16)

    # Distant metallic reverberant hits and a high radar ping every two bars.
    rng = np.random.default_rng(83)
    for bar in range(int(duration / (beat * 4))):
        if bar % 2 == 0:
            local = seconds(1.5)
            ping = np.sin(2 * np.pi * 1760 * local) * np.exp(-local / 0.35) * 0.5
            ping += np.sin(2 * np.pi * 2637 * local) * np.exp(-local / 0.2) * 0.25
            add(bar * beat * 4 + beat * 3.5, ping, 0.05)
        if rng.uniform() < 0.6:
            local = seconds(2.5)
            partials = [rng.uniform(140, 260) * r for r in (1, 2.31, 3.87, 5.12)]
            metal = sum(np.sin(2 * np.pi * p * local) / (i + 1) for i, p in enumerate(partials)) * np.exp(-local / 0.9)
            add(bar * beat * 4 + rng.uniform(0, beat * 4), metal, 0.07)

    # Air: wide filtered noise that rises and falls with the drone.
    air = bandpass(noise(duration, 84), 300, 2400) * (0.05 + 0.08 * breathing)
    out += air

    # Loop-wrapped reverb keeps the seam continuous.
    tail = noise(2.0, 85) * np.exp(-seconds(2.0) / 0.5)
    tail = lowpass(tail, 3000)
    padded = np.concatenate([out, np.zeros(len(tail))])
    wet = np.fft.irfft(np.fft.rfft(padded) * np.fft.rfft(np.concatenate([tail, np.zeros(len(out))])), len(padded))
    looped = wet[: len(out)].copy()
    looped[: len(tail)] += wet[len(out):]
    looped /= np.max(np.abs(looped)) + 1e-9
    mix = out / (np.max(np.abs(out)) + 1e-9) + 0.35 * looped
    return np.tanh(1.2 * mix)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: synthesize_audio.py OUT_DIR")
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    effects = {
        "shot": rifle_shot(), "reload": reload_sequence(), "destroyed": explosion(),
        "drone-charge": drone_charge(), "drone-fire": drone_fire(), "hit": hit_confirm(),
        "hurt": hurt(), "dry-fire": dry_fire(), "victory": victory()
    }
    for name, signal in effects.items():
        write(out / f"{name}.wav", signal)
    loop = score()
    with wave.open(str(out / "score.wav"), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes((normalize(loop, -3.0) * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    main()
