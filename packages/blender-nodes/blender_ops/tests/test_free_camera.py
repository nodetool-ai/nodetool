"""Pin the free camera port in `framing.py` to the shared goldens.

Needs no bpy, so plain Python runs it as well as Blender's interpreter.
`tests/free-camera.test.ts` asserts the same goldens from
`model3dFreeCameraBasis` and `computeFreeClipPlanes` and drives this file.

Goldens: position (3, 2, -4), target (-1, 0.5, 2), roll 37 degrees, in the
three.js frame (Y up).
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from framing import (
    free_camera_axes,
    free_camera_matrix_columns,
    free_camera_pose,
    free_clip_planes,
    three_to_blender,
)

GOLDEN = {
    "forward": (-0.543075, -0.203653, 0.814613),
    "right": (-0.732490, 0.589203, -0.341026),
    "up": (0.410521, 0.781899, 0.469156),
}


def check(label, actual, expected):
    if abs(actual - expected) > 5e-6:
        print("MISMATCH %s: got %r want %r" % (label, actual, expected))
        sys.exit(1)


def check_vector(label, actual, expected):
    for index in range(3):
        check("%s[%d]" % (label, index), actual[index], expected[index])


params = {"position": [3, 2, -4], "target": [-1, 0.5, 2], "roll": 37}
axes = free_camera_axes(params["position"], params["target"], params["roll"])
for name in ("forward", "right", "up"):
    check_vector(name, axes[name], GOLDEN[name])

# Blender space: (x, y, z) -> (x, -z, y), camera columns right, up, -forward.
location, (x_axis, y_axis, z_axis) = free_camera_matrix_columns(params)
check_vector("location", location, (3, 4, 2))
check_vector("x_axis", x_axis, three_to_blender(GOLDEN["right"]))
check_vector("y_axis", y_axis, three_to_blender(GOLDEN["up"]))
check_vector("z_axis", z_axis, tuple(-v for v in three_to_blender(GOLDEN["forward"])))

# A positive roll turns the horizon clockwise: world up reads right of
# vertical in the picture.
level = free_camera_axes((0, 0, 5), (0, 0, 0), 0)
rolled = free_camera_axes((0, 0, 5), (0, 0, 0), 30)
check_vector("level.right", level["right"], (1, 0, 0))
check("rolled world-up screen x", rolled["right"][1], 0.5)
check("rolled world-up screen y", rolled["up"][1], 0.866025)

pose = free_camera_pose({})
check_vector("default position", pose["position"], (0, 1.6, 5))
check_vector("default target", pose["target"], (0, 1, 0))
check("default roll", pose["roll"], 0)

outside = free_clip_planes(7.5, 2)
check("outside near", outside["near"], 0.0155)
check("outside far", outside["far"], 15.5)
far_away = free_clip_planes(20, 2)
check("far away near", far_away["near"], 12)
inside = free_clip_planes(0.5, 10)
check("inside near", inside["near"], 0.0405)
check("inside far", inside["far"], 40.5)

print("free camera goldens ok")
