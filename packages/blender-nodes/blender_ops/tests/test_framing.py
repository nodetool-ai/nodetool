"""T3, Python side: pin the `framing.py` port to the shared goldens.

Runs under Blender's own interpreter (`blender -b --python ...`), which the
TypeScript suite (`tests/framing.test.ts`) drives when Blender is present.
Plain asserts only: Blender's Python has no pytest. Exits nonzero on the
first mismatch, printing both values.

Goldens: radius 2, fov 40, aspect 4/3, zoom 1.2; azimuth 30, elevation 20;
bounds center (0.5, 0.25, -1). Same numbers as `framing.test.ts`.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from framing import compute_framing, orbit_offset

GOLDEN = {
    "distance": 4.8730,
    "near": 0.0487,
    "far": 24.8730,
    "offset": (2.2896, 1.6667, 3.9656),
    "position": (2.7896, 1.9167, 2.9656),
    "center": (0.5, 0.25, -1.0),
}


def check(label, actual, expected):
    if abs(actual - expected) > 5e-5:
        print("MISMATCH %s: got %r want %r" % (label, actual, expected))
        sys.exit(1)


framing = compute_framing(2, 40, 4.0 / 3.0, 1.2)
check("distance", framing["distance"], GOLDEN["distance"])
check("near", framing["near"], GOLDEN["near"])
check("far", framing["far"], GOLDEN["far"])

offset = orbit_offset(30, 20, framing["distance"])
check("offset.x", offset["x"], GOLDEN["offset"][0])
check("offset.y", offset["y"], GOLDEN["offset"][1])
check("offset.z", offset["z"], GOLDEN["offset"][2])

cx, cy, cz = GOLDEN["center"]
check("position.x", cx + offset["x"], GOLDEN["position"][0])
check("position.y", cy + offset["y"], GOLDEN["position"][1])
check("position.z", cz + offset["z"], GOLDEN["position"][2])

print("framing goldens ok")
