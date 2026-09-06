"""Pin `apply_camera_lens` to the vertical fov, with no Blender in sight.

`framing.apply_camera_lens` writes onto a camera datablock but imports no bpy,
so this file runs under plain `python3` as well as under Blender's own
interpreter. `tests/camera-lens.test.ts` drives it both ways.

The stub below reproduces the two RNA properties that matter, from Blender's
`rna_camera.cc`: `angle` reads and writes `lens` against whichever sensor axis
`sensor_fit` names, while `angle_y` always uses `sensor_height`. That
difference is the bug this file guards: the still ops built the orbit camera
and wrote `angle` while the fit was still `AUTO` (so, the 36mm width), and the
sampled bake wrote `angle` again on the same camera once the fit was
`VERTICAL` (the 24mm height). Same params, two focal lengths, two pictures.

Plain asserts only: Blender's Python has no pytest.
"""

import math
import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), ".."))

from framing import apply_camera_lens, compute_framing


class FakeCameraData(object):
    """`bpy.types.Camera`'s lens properties, as Blender computes them."""

    def __init__(self):
        # What `bpy.data.cameras.new()` returns.
        self.sensor_width = 36.0
        self.sensor_height = 24.0
        self.sensor_fit = "AUTO"
        self.lens = 50.0
        self.clip_start = 0.1
        self.clip_end = 100.0

    def _fit_sensor(self):
        if self.sensor_fit == "VERTICAL":
            return self.sensor_height
        return self.sensor_width

    @property
    def angle(self):
        return 2 * math.atan(self._fit_sensor() / (2 * self.lens))

    @angle.setter
    def angle(self, value):
        self.lens = self._fit_sensor() / (2 * math.tan(value / 2))

    @property
    def angle_y(self):
        return 2 * math.atan(self.sensor_height / (2 * self.lens))

    @angle_y.setter
    def angle_y(self, value):
        self.lens = self.sensor_height / (2 * math.tan(value / 2))


def check(label, actual, expected, tolerance=1e-6):
    if abs(actual - expected) > tolerance:
        print("MISMATCH %s: got %r want %r" % (label, actual, expected))
        sys.exit(1)


FOV = 35.0
RADIUS = 1.5
ASPECT = 160.0 / 120.0
FRAMING = compute_framing(RADIUS, FOV, ASPECT, 1.0)

# 1. The requested fov is the vertical one, and the clips come from the framing.
fresh = FakeCameraData()
apply_camera_lens(fresh, FOV, FRAMING)
check("vertical fov", math.degrees(fresh.angle_y), FOV, 1e-9)
check("sensor fit", 1.0 if fresh.sensor_fit == "VERTICAL" else 0.0, 1.0)
check("clip_start", fresh.clip_start, FRAMING["near"])
check("clip_end", fresh.clip_end, FRAMING["far"])

# 2. The lens does not depend on the fit the camera arrived with. A camera the
#    sampled bake re-places is already VERTICAL; a camera `make_orbit_camera`
#    just created is AUTO. Writing `angle` gave those two 57.09mm and 38.06mm.
placed_again = FakeCameraData()
placed_again.sensor_fit = "VERTICAL"
apply_camera_lens(placed_again, FOV, FRAMING)
check("lens is fit-independent", placed_again.lens, fresh.lens, 1e-9)
check("lens", fresh.lens, 24.0 / (2 * math.tan(math.radians(FOV) / 2)), 1e-9)

# 3. The lens and the distance `compute_framing` returned describe one camera:
#    the bounding sphere the distance was fitted to is inside the frame. The
#    36mm-wide reading failed this — 0.3007 of a sphere against a 0.2102 frame.
half_height = math.tan(fresh.angle_y / 2)
if RADIUS / FRAMING["distance"] > half_height + 1e-9:
    print(
        "MISMATCH sphere fit: radius/distance %r exceeds tan(vfov/2) %r"
        % (RADIUS / FRAMING["distance"], half_height)
    )
    sys.exit(1)

# 4. The fov clamp matches `compute_framing`'s, so a degenerate fov still
#    leaves the lens and the distance agreeing.
tiny = FakeCameraData()
tiny_framing = compute_framing(RADIUS, 0.0, ASPECT, 1.0)
apply_camera_lens(tiny, 0.0, tiny_framing)
check("clamped fov", math.degrees(tiny.angle_y), 1.0, 1e-9)

print("camera lens ok")
