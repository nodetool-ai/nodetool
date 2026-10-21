#!/usr/bin/env python3
"""Synthesizes the RIDGELINE engine grains, effects and score loop with NumPy.

Run from the repository root:

    python3 packages/game-runtime/samples/ridgeline/tools/synthesize_audio.py OUT_DIR

Writes 48 kHz mono WAV files and `score.wav`, a seamless 40-second loop.
Encode the loop with `ffmpeg -i score.wav -c:a libvorbis -q:a 4 score.ogg`.

Engine and wind sounds are grains: 2.25 s each, with 0.25 s equal-power fades
at both ends. The jet script starts one grain every 120 ticks (2 s), so each
grain fades in over the previous one's fade out and the sound never breaks.
Every generator uses a fixed seed, so the output is reproducible.
"""
import sys
import wave
from pathlib import Path

import numpy as np

RATE = 48000
GRAIN = 2.25
GRAIN_FADE = 0.25


def seconds(duration):
    return np.arange(int(round(duration * RATE))) / RATE


def noise(duration, seed):
    return np.random.default_rng(seed).standard_normal(int(round(duration * RATE)))


def spectral(signal, response):
    spectrum = np.fft.rfft(signal)
    frequencies = np.fft.rfftfreq(len(signal), 1 / RATE)
    return np.fft.irfft(spectrum * response(frequencies), len(signal))


def lowpass(signal, cutoff, order=2):
    return spectral(signal, lambda f: 1 / np.sqrt(1 + (f / cutoff) ** (2 * order)))


def highpass(signal, cutoff, order=2):
    return spectral(signal, lambda f: 1 / np.sqrt(1 + (cutoff / np.maximum(f, 1e-3)) ** (2 * order)))


def bandpass(signal, low, high, order=2):
    return highpass(lowpass(signal, high, order), low, order)


def peak(signal, centre, width, gain):
    """Adds a resonant bump around `centre` Hz."""
    return spectral(signal, lambda f: 1 + gain * np.exp(-((f - centre) / width) ** 2))


def sweep(start, end, duration, curve=1.0):
    t = seconds(duration)
    frequency = start * (end / start) ** ((t / duration) ** curve)
    return np.sin(2 * np.pi * np.cumsum(frequency) / RATE)


def envelope(duration, attack, decay):
    t = seconds(duration)
    return np.minimum(1, t / max(attack, 1e-4)) * np.exp(-t / decay)


def normalize(signal, peak_db=-1.0):
    return signal / (np.max(np.abs(signal)) + 1e-9) * 10 ** (peak_db / 20)


def fade(signal, tail=0.01):
    count = int(tail * RATE)
    signal = signal.copy()
    signal[-count:] *= np.linspace(1, 0, count)
    return signal


def write(path, signal, peak_db=-1.0, tail=0.01):
    data = np.clip(normalize(fade(signal, tail) if tail else signal, peak_db), -1, 1)
    with wave.open(str(path), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes((data * 32767).astype("<i2").tobytes())


def grain(signal):
    """Shapes a GRAIN-long signal with equal-power fades for overlap-add playback."""
    count = int(GRAIN_FADE * RATE)
    shaped = signal[: int(GRAIN * RATE)].copy()
    ramp = np.sin(np.linspace(0, np.pi / 2, count))
    shaped[:count] *= ramp
    shaped[-count:] *= ramp[::-1]
    return shaped


def turbine(duration, whine, seed, roar_cutoff, roar_gain, whine_gain, crackle=0.0):
    t = seconds(duration)
    rng = np.random.default_rng(seed)
    wobble = 1 + 0.004 * np.sin(2 * np.pi * 3.1 * t + rng.uniform(0, 6)) + 0.002 * np.sin(2 * np.pi * 7.3 * t)
    phase = 2 * np.pi * np.cumsum(whine * wobble) / RATE
    tone = sum(np.sin(phase * k + rng.uniform(0, 6)) / k ** 1.4 for k in (1, 2, 3, 5))
    tone += 0.35 * np.sin(phase * 0.5)
    roar = lowpass(noise(duration, seed + 1), roar_cutoff, 3)
    roar = peak(roar, roar_cutoff * 0.35, roar_cutoff * 0.2, 1.5)
    rumble = lowpass(noise(duration, seed + 2), 90, 2) * 2.2
    out = whine_gain * tone + roar_gain * roar + 0.7 * rumble
    if crackle:
        pops = np.zeros(len(t))
        positions = rng.integers(0, len(t), int(duration * 140))
        pops[positions] = rng.uniform(-1, 1, len(positions))
        pops = bandpass(pops, 120, 2600) * 18
        out += crackle * pops
    return out


def engine_idle():
    return grain(turbine(GRAIN, 1180, 11, 1400, 0.9, 0.22))


def engine_military():
    return grain(turbine(GRAIN, 2350, 21, 2600, 1.2, 0.18))


def engine_afterburner():
    return grain(turbine(GRAIN, 2500, 31, 3800, 1.6, 0.12, crackle=0.45))


def wind():
    rush = bandpass(noise(GRAIN, 41), 400, 5200)
    t = seconds(GRAIN)
    gust = 0.8 + 0.2 * np.sin(2 * np.pi * 0.7 * t)
    whistle = peak(rush, 2200, 300, 2.5) * gust
    return grain(whistle)


def gear():
    t = seconds(2.2)
    whine = sweep(380, 720, 2.2, 0.7) * (0.25 + 0.75 * np.minimum(1, t / 0.2)) * np.exp(-np.maximum(t - 1.7, 0) / 0.08)
    whine = lowpass(whine, 2400) * 0.35
    hiss = bandpass(noise(2.2, 51), 1500, 6000) * 0.08 * np.exp(-t / 1.2)
    clunk = np.zeros(len(t))
    hit = lowpass(noise(0.25, 52), 900) * envelope(0.25, 0.001, 0.05) + sweep(140, 60, 0.25, 0.5) * envelope(0.25, 0.001, 0.07)
    start = int(1.75 * RATE)
    clunk[start:start + len(hit)] += hit * 1.3
    return whine + hiss + clunk


def touchdown():
    t = seconds(0.9)
    chirp = bandpass(noise(0.9, 61), 900, 3200) * envelope(0.9, 0.003, 0.12)
    squeal = sweep(1500, 1100, 0.9, 0.6) * envelope(0.9, 0.005, 0.1) * 0.35
    thump = sweep(110, 45, 0.9, 0.5) * envelope(0.9, 0.002, 0.09) * 1.4
    return chirp + squeal + thump + lowpass(noise(0.9, 62), 400) * np.exp(-t / 0.3) * 0.25


def gate_chime():
    out = np.zeros(int(1.6 * RATE))
    for index, frequency in enumerate((1318.5, 1760.0, 2637.0)):
        start = int(index * 0.07 * RATE)
        local = seconds(1.6 - index * 0.07)
        tone = np.sin(2 * np.pi * frequency * local) + 0.3 * np.sin(2 * np.pi * frequency * 2.01 * local)
        out[start:start + len(local)] += tone * np.exp(-local / 0.45) * (0.9 - index * 0.15)
    swoosh = bandpass(noise(1.6, 71), 2000, 9000) * envelope(1.6, 0.05, 0.18) * 0.25
    return out + swoosh


def stall_warning():
    out = np.zeros(int(1.0 * RATE))
    for index in range(2):
        start = int(index * 0.5 * RATE)
        local = seconds(0.32)
        tone = np.sign(np.sin(2 * np.pi * (1050 if index == 0 else 780) * local))
        out[start:start + len(local)] += lowpass(tone, 3000) * np.minimum(1, local / 0.01) * np.minimum(1, (0.32 - local) / 0.02) * 0.5
    return out


def crash():
    t = seconds(3.5)
    blast = lowpass(noise(3.5, 81), 1800, 2) * envelope(3.5, 0.004, 0.5)
    boom = sweep(90, 28, 3.5, 0.4) * envelope(3.5, 0.002, 0.7) * 2.2
    debris = bandpass(noise(3.5, 82), 1200, 7000) * envelope(3.5, 0.02, 0.35) * 0.5
    rumble = lowpass(noise(3.5, 83), 120) * np.exp(-t / 1.4) * 2.5
    return np.tanh(blast + boom + debris + rumble)


def afterburner_light():
    t = seconds(1.4)
    whoomp = lowpass(noise(1.4, 91), 700) * envelope(1.4, 0.03, 0.35) * 2.5
    thump = sweep(70, 40, 1.4, 0.5) * envelope(1.4, 0.01, 0.3) * 1.5
    roar = bandpass(noise(1.4, 92), 300, 3000) * np.minimum(1, t / 0.2) * np.exp(-t / 0.6)
    return whoomp + thump + roar


def note_frequency(semitones_from_a4):
    return 440 * 2 ** (semitones_from_a4 / 12)


def victory():
    duration = 4.0
    out = np.zeros(int(duration * RATE))
    chords = [(0.0, [-7, -3, 0, 5]), (0.5, [-5, -1, 2, 7]), (1.0, [-2, 2, 5, 10])]
    for at, notes in chords:
        local = seconds(duration - at)
        start = int(at * RATE)
        for n in notes:
            f = note_frequency(n)
            saw = sum(np.sin(2 * np.pi * f * k * local) / k for k in range(1, 7))
            out[start:start + len(local)] += saw * np.exp(-local / (1.2 if at == 1.0 else 0.5)) * 0.18
    shimmer = bandpass(noise(duration, 101), 4000, 12000) * envelope(duration, 0.8, 1.2) * 0.1
    return lowpass(out, 5000) + shimmer


def score():
    """A seamless 40 s soaring loop at 96 BPM: pads, arpeggio, bass and soft drums in D major."""
    beat = 60 / 96
    bar = beat * 4
    duration = bar * 16
    t = seconds(duration)
    out = np.zeros(len(t))

    def add(at, sound, gain):
        start = int(round(at * RATE)) % len(out)
        end = min(len(out), start + len(sound))
        out[start:end] += gain * sound[: end - start]
        rest = len(sound) - (end - start)
        if rest > 0:
            out[:rest] += gain * sound[end - start:]

    # Chords per two bars, as semitones from A4: D, Bm, G, A, then D/F#, Em, G, Asus.
    progression = [
        [-19, -7, -3, 0, 4], [-22, -10, -7, -3, 2], [-26, -14, -10, -7, -2], [-24, -12, -8, -5, 0],
        [-15, -7, -3, 0, 4], [-17, -10, -5, -2, 2], [-26, -14, -10, -7, -2], [-24, -12, -7, -5, 0],
    ]
    rng = np.random.default_rng(111)
    for index, chord in enumerate(progression):
        length = bar * 2 + 1.5
        local = seconds(length)
        swell = np.minimum(1, local / 1.2) * np.minimum(1, np.maximum(length - local, 0) / 1.5)
        pad = np.zeros(len(local))
        for n in chord[1:]:
            for detune in (-0.08, 0.0, 0.07):
                f = note_frequency(n + detune)
                phase = (f * local + rng.uniform()) % 1
                pad += (2 * phase - 1) * 0.2
        pad = lowpass(pad, 1400 + 600 * (index % 2))
        add(index * bar * 2, pad * swell, 0.35)
        # Sub bass on the chord root, with a push on the fourth beat.
        root = note_frequency(chord[0])
        for b in range(8):
            local_b = seconds(beat * 0.95)
            bass = np.sin(2 * np.pi * root * local_b) + 0.3 * np.sin(4 * np.pi * root * local_b)
            add(index * bar * 2 + b * beat, bass * envelope(beat * 0.95, 0.005, 0.35), 0.35 if b % 4 == 0 else 0.22)
        # Plucked arpeggio in eighth notes from the third bar on.
        if index >= 1:
            pattern = [1, 2, 3, 4, 3, 2, 4, 3]
            for step in range(16):
                n = chord[pattern[step % len(pattern)]] + 12
                f = note_frequency(n)
                local_p = seconds(beat * 1.2)
                pluck = (np.sin(2 * np.pi * f * local_p) + 0.4 * np.sin(4 * np.pi * f * local_p) + 0.15 * np.sin(6 * np.pi * f * local_p))
                add(index * bar * 2 + step * beat / 2, pluck * envelope(beat * 1.2, 0.002, 0.18), 0.08 + 0.03 * (step % 4 == 0))

    # Drums from bar 4: soft kick on 1 and 3, brushed hats on the off-beats, a tom fill every 8 bars.
    kick = sweep(110, 42, 0.4, 0.5) * envelope(0.4, 0.002, 0.1)
    hat = highpass(noise(0.08, 121), 7000) * envelope(0.08, 0.001, 0.02)
    snare = bandpass(noise(0.3, 122), 900, 6000) * envelope(0.3, 0.001, 0.07) + np.sin(2 * np.pi * 190 * seconds(0.3)) * envelope(0.3, 0.001, 0.05)
    for index in range(int(duration / beat)):
        at = index * beat
        if at < bar * 3:
            continue
        if index % 4 in (0, 2):
            add(at, kick, 0.7)
        if index % 4 == 2:
            add(at, snare, 0.22)
        add(at + beat / 2, hat, 0.12)
        if index % 32 == 31:
            for k, f in enumerate((180, 150, 120)):
                tom = np.sin(2 * np.pi * f * seconds(0.3)) * envelope(0.3, 0.002, 0.12)
                add(at + k * beat / 3, tom, 0.3)

    # Air: a wide wind bed that swells every four bars.
    swell = 0.5 + 0.5 * np.sin(2 * np.pi * t / (bar * 4) - np.pi / 2)
    out += bandpass(noise(duration, 131), 250, 3000) * (0.03 + 0.05 * swell)

    # Loop-wrapped reverb keeps the seam continuous.
    tail = lowpass(noise(3.0, 132) * np.exp(-seconds(3.0) / 0.8), 4000)
    padded = np.concatenate([out, np.zeros(len(tail))])
    wet = np.fft.irfft(np.fft.rfft(padded) * np.fft.rfft(np.concatenate([tail, np.zeros(len(out))])), len(padded))
    looped = wet[: len(out)].copy()
    looped[: len(tail)] += wet[len(out):]
    looped /= np.max(np.abs(looped)) + 1e-9
    mix = out / (np.max(np.abs(out)) + 1e-9) + 0.3 * looped
    return np.tanh(1.1 * mix)


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: synthesize_audio.py OUT_DIR")
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    grains = {"engine-idle": engine_idle(), "engine-mil": engine_military(), "engine-ab": engine_afterburner(), "wind": wind()}
    for name, signal in grains.items():
        write(out / f"{name}.wav", signal, peak_db=-3.0, tail=0)
    effects = {"gear": gear(), "touchdown": touchdown(), "gate": gate_chime(), "stall": stall_warning(),
               "crash": crash(), "afterburner": afterburner_light(), "victory": victory()}
    for name, signal in effects.items():
        write(out / f"{name}.wav", signal)
    with wave.open(str(out / "score.wav"), "wb") as handle:
        handle.setnchannels(1)
        handle.setsampwidth(2)
        handle.setframerate(RATE)
        handle.writeframes((normalize(score(), -3.0) * 32767).astype("<i2").tobytes())


if __name__ == "__main__":
    main()
