#!/usr/bin/env python3
"""Plans the RIDGELINE course: gate poses, the racing line and cloud banks.

Run from the repository root after build_terrain.py:

    python3 packages/game-runtime/samples/ridgeline/tools/plan_course.py TERRAIN_DIR

Reads `heights.npy` from TERRAIN_DIR and writes `course.json` beside it. The
racing line is a Catmull-Rom spline from the runway, along the canyon and back
for a low pass over the runway. Gates sit on the line and face along it. The
route recorder steers the jet along the same line. The output is deterministic.
"""
import json
import math
import sys
from pathlib import Path

import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent))
import landscape as L  # noqa: E402

GATE_SPACING_M = None


def sampler(heights):
    n = heights.shape[0]
    spacing = L.SIZE / (n - 1)

    def height(x, z):
        fx = (x + L.HALF) / spacing
        fz = (z + L.HALF) / spacing
        i0 = int(np.clip(math.floor(fx), 0, n - 2))
        j0 = int(np.clip(math.floor(fz), 0, n - 2))
        tx, tz = fx - i0, fz - j0
        a, b = heights[j0, i0], heights[j0, i0 + 1]
        c, d = heights[j0 + 1, i0], heights[j0 + 1, i0 + 1]
        return float((a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + d * tx) * tz)
    return height


def catmull(points, samples):
    pts = np.asarray(points, float)
    padded = np.vstack([pts[0] * 2 - pts[1], pts, pts[-1] * 2 - pts[-2]])
    out = []
    for i in range(1, len(padded) - 2):
        p0, p1, p2, p3 = padded[i - 1], padded[i], padded[i + 1], padded[i + 2]
        for s in range(samples):
            t = s / samples
            t2, t3 = t * t, t * t * t
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3))
    out.append(pts[-1])
    return np.array(out)


def resample(line, step):
    seg = np.linalg.norm(np.diff(line, axis=0), axis=1)
    arc = np.concatenate([[0], np.cumsum(seg)])
    targets = np.arange(0, arc[-1], step)
    return np.stack([np.interp(targets, arc, line[:, k]) for k in range(3)], axis=1), arc[-1]


def look_quaternion(direction):
    """Rotation whose local -Z points along `direction`, keeping +Y up."""
    f = np.asarray(direction, float)
    f /= np.linalg.norm(f)
    back = -f
    right = np.cross([0, 1, 0], back)
    right /= np.linalg.norm(right)
    up = np.cross(back, right)
    m = np.array([right, up, back]).T
    trace = m[0, 0] + m[1, 1] + m[2, 2]
    if trace > 0:
        t = 0.5 / math.sqrt(trace + 1)
        return [(m[2, 1] - m[1, 2]) * t, (m[0, 2] - m[2, 0]) * t, (m[1, 0] - m[0, 1]) * t, 0.25 / t]
    i = int(np.argmax([m[0, 0], m[1, 1], m[2, 2]]))
    j, k = (i + 1) % 3, (i + 2) % 3
    t = 2 * math.sqrt(1 + m[i, i] - m[j, j] - m[k, k])
    q = [0.0, 0.0, 0.0, (m[k, j] - m[j, k]) / t]
    q[i] = 0.25 * t
    q[j] = (m[j, i] + m[i, j]) / t
    q[k] = (m[k, i] + m[i, k]) / t
    return q


def main():
    if len(sys.argv) != 2:
        raise SystemExit("usage: plan_course.py TERRAIN_DIR")
    directory = Path(sys.argv[1])
    heights = np.load(directory / "heights.npy").astype(np.float64)
    height = sampler(heights)
    canyon = L.canyon_path_smooth(2)
    # Racing line control points: climb out, the canyon at 55 m above its bed, and the return.
    control = [(0, 140, -1150), (-330, 150, -1500)]
    control += [(x, bed + 55, z) for x, z, bed in canyon[1:-1]]
    control += [(2650, 140, 350), (2350, 260, 1700), (1300, 300, 2900), (0, 220, 3300), (-900, 180, 2750),
                (-700, 140, 1900), (0, 95, 1500), (0, 62, 600), (0, 58, -200)]
    line = catmull(control, 12)
    line, length = resample(line, 10.0)
    # Keep the line 45 m clear of terrain, and the gate ring 6 m clear of the runway on the low pass.
    for k, (x, y, z) in enumerate(line):
        floor = height(x, z) + (24 if abs(x) < 60 and z > -950 and z < 1300 else 45)
        line[k, 1] = max(y, floor)
    # Smooth the vertical profile so the line has no steps.
    for _ in range(30):
        line[1:-1, 1] = np.maximum(line[1:-1, 1], 0.5 * (line[:-2, 1] + line[2:, 1]))
    gates = []
    marks = [0.07, 0.14, 0.21, 0.28, 0.34, 0.40, 0.46, 0.52, 0.60, 0.70, 0.80, 0.88, 0.995]
    for index, mark in enumerate(marks):
        k = min(len(line) - 2, int(mark * (len(line) - 1)))
        p = line[k]
        tangent = line[k + 1] - line[max(k - 1, 0)]
        gates.append({"id": f"gate-{index + 1}", "p": [round(float(v), 2) for v in p],
                      "q": [round(float(v), 6) for v in look_quaternion(tangent)]})
    rng = np.random.default_rng(4)
    clouds = []
    for _ in range(26):
        x, z = rng.uniform(-6000, 6000, 2)
        base = max(height(x, z) + 250, 780) if abs(x) < 5000 and abs(z) < 5000 else 760
        clouds.append({"p": [round(float(x), 1), round(float(base + rng.uniform(0, 300)), 1), round(float(z), 1)],
                       "r": round(float(rng.uniform(220, 420)), 1)})
    course = {"length": round(float(length), 1), "line": [[round(float(v), 2) for v in p] for p in line[::2]],
              "gates": gates, "clouds": clouds,
              "spawn": {"p": [0.0, L.AIRFIELD_HEIGHT + 1.9, 820.0], "q": [0.0, 0.0, 0.0, 1.0]}}
    (directory / "course.json").write_text(json.dumps(course, indent=1))
    print(json.dumps({"length": course["length"], "gates": len(gates), "line": len(course["line"])}))


if __name__ == "__main__":
    main()
