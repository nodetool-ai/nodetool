#!/usr/bin/env python3
"""Generate the swing score for the Tidewater example timeline.

Eight bars at 120 BPM, one bar per two seconds, so every scene cut in
tidewater.mjs lands on a downbeat. Standard library only.
"""

import math
import random
import wave
from array import array
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "packages/base-nodes/nodetool/assets/nodetool-base/timelines/tidewater/score.wav"
RATE = 44100
BPM = 120
BEAT = 60 / BPM
SECONDS = 16
SWING = 2 / 3  # the second eighth of a beat lands two thirds of the way through it

mix = [0.0] * (RATE * SECONDS)
rng = random.Random(14)


def midi(n):
    return 440 * 2 ** ((n - 69) / 12)


def add(start, samples):
    at = int(start * RATE)
    for i, v in enumerate(samples):
        if 0 <= at + i < len(mix):
            mix[at + i] += v


def bass(note, dur, vel=0.5):
    f = midi(note)
    n = int(dur * RATE)
    out = []
    for i in range(n):
        t = i / RATE
        env = min(1, t / 0.006) * math.exp(-t * 3.2)
        tone = math.sin(2 * math.pi * f * t) + 0.35 * math.sin(4 * math.pi * f * t) + 0.12 * math.sin(6 * math.pi * f * t)
        pluck = math.exp(-t * 60) * 0.4 * math.sin(2 * math.pi * f * 3 * t)
        out.append(vel * env * (tone + pluck))
    return out


def piano(notes, dur, vel=0.12):
    n = int(dur * RATE)
    fs = [midi(x) for x in notes]
    out = []
    for i in range(n):
        t = i / RATE
        env = min(1, t / 0.004) * math.exp(-t * 2.4)
        s = 0.0
        for f in fs:
            s += math.sin(2 * math.pi * f * t) + 0.3 * math.sin(4 * math.pi * f * t) * math.exp(-t * 6)
        out.append(vel * env * s / len(fs))
    return out


def noise_hit(dur, decay, vel, tone=0.0, bright=0.85):
    """Filtered noise: a ride with `tone` > 0, a brush without."""
    n = int(dur * RATE)
    out, prev = [], 0.0
    for i in range(n):
        t = i / RATE
        w = rng.uniform(-1, 1)
        hp = w - bright * prev  # a one-pole high-pass keeps the hiss above the bass
        prev = w
        ring = tone and math.sin(2 * math.pi * tone * t) * 0.3
        out.append(vel * math.exp(-t * decay) * (hp + ring))
    return out


# ii-V-I in F, twice: Gm7 C7 Fmaj7 Fmaj7.
CHORDS = [(55, 58, 62, 65), (52, 58, 60, 64), (53, 57, 60, 64), (53, 57, 60, 64)]
WALK = [
    [43, 45, 46, 47], [48, 50, 52, 49], [41, 45, 48, 50], [53, 52, 50, 44],
    [43, 45, 46, 47], [48, 46, 45, 43], [41, 43, 45, 48], [41],
]

for bar in range(8):
    t0 = bar * 4 * BEAT
    last = bar == 7
    for k, note in enumerate(WALK[bar]):
        add(t0 + k * BEAT, bass(note, 3.2 if last else BEAT * 0.95, 0.55 if k == 0 else 0.45))
    chord = CHORDS[bar % 4]
    if last:
        add(t0, piano((53, 57, 60, 64, 67), 3.5, 0.2))
        add(t0, noise_hit(3.5, 1.4, 0.16, tone=5200))
        continue
    # Charleston comping: the downbeat and the swung "and" of two.
    add(t0, piano(chord, BEAT * 1.2))
    add(t0 + (1 + SWING) * BEAT, piano(chord, BEAT * 1.6, 0.1))
    for beat in range(4):
        add(t0 + beat * BEAT, noise_hit(0.9, 5.5, 0.09, tone=5200))
        if beat in (1, 3):
            add(t0 + (beat + SWING) * BEAT, noise_hit(0.5, 7, 0.06, tone=5200))
            add(t0 + beat * BEAT, noise_hit(0.22, 18, 0.13, bright=0.4))

peak = max(abs(v) for v in mix) or 1
fade = int(0.6 * RATE)
pcm = array("h")
for i, v in enumerate(mix):
    gain = min(1, (len(mix) - i) / fade)
    pcm.append(int(max(-1, min(1, v / peak * 0.85 * gain)) * 32767))
OUT.parent.mkdir(parents=True, exist_ok=True)
with wave.open(str(OUT), "wb") as wav:
    wav.setnchannels(1)
    wav.setsampwidth(2)
    wav.setframerate(RATE)
    wav.writeframes(pcm.tobytes())
print(f"wrote {OUT}")
