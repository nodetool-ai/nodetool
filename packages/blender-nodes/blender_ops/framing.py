"""Auto-framing math for the Blender orbit camera.

A line-for-line port of `computeFraming` and `orbitOffset` from
`packages/video-nodes/src/nodes/model3d/render3d-core.ts`: same math, same
names (snake_cased). The two sides are pinned to the same golden camera
position by `tests/framing.test.ts` (TypeScript) and
`blender_ops/tests/test_framing.py` (this interpreter).

The offsets are in the three.js convention (Y up). `ops/render_image.py`
rotates them rigidly into Blender space when placing the camera; the
functions here stay identical so the cross-language pin holds.

`apply_camera_lens` is the one function here that is not part of that port:
it writes the framing onto a camera datablock, and lives beside the math so
that what `fov` means (the vertical axis) is decided in one place. It touches
no bpy API, so `tests/test_camera_lens.py` exercises it without Blender.
"""

import math


def compute_framing(radius, fov_deg, aspect, zoom):
    """Distance fitting a bounding sphere of `radius` into the frame.

    `zoom` > 1 moves closer. Returns a dict with `distance`, `near`, `far`.
    """
    safe_radius = max(radius, 1e-6)
    v_fov = (max(fov_deg, 1) * math.pi) / 180
    h_fov = 2 * math.atan(math.tan(v_fov / 2) * max(aspect, 1e-6))
    fit_v = safe_radius / math.sin(v_fov / 2)
    fit_h = safe_radius / math.sin(h_fov / 2)
    distance = max(fit_v, fit_h) / max(zoom, 1e-3)
    return {
        "distance": distance,
        "near": max(distance - safe_radius * 4, distance / 100, 1e-4),
        "far": distance + safe_radius * 10,
    }


def orbit_offset(azimuth_deg, elevation_deg, distance):
    """Spherical-to-cartesian offset for the orbit camera (Y up)."""
    az = (azimuth_deg * math.pi) / 180
    el = (min(max(elevation_deg, -89.9), 89.9) * math.pi) / 180
    return {
        "x": distance * math.cos(el) * math.sin(az),
        "y": distance * math.sin(el),
        "z": distance * math.cos(el) * math.cos(az),
    }


def apply_camera_lens(data, fov_deg, framing):
    """Give a camera datablock the vertical fov `fov_deg` and `framing`'s clips.

    `fov` means the *vertical* field of view on both sides of this stack:
    `compute_framing` fits the bounding sphere against `v_fov`, and the
    three.js preview sets `PerspectiveCamera.fov`, which is vertical too. So
    the fit is `VERTICAL` and the angle is written through `angle_y`, which
    always resolves against `sensor_height`.

    Bare `angle` would not: it resolves against whichever axis `sensor_fit`
    names, so writing it before the fit is set means the 36mm sensor *width*
    and leaves a 35 degree request as a 23.7 degree camera — a 1.52x tighter
    crop that no longer fits the sphere `compute_framing` measured. Two
    callers wrote `angle` in opposite orders and rendered the same model at
    two sizes; `angle_y` makes the order irrelevant.

    Takes the datablock instead of importing bpy, so the rule is testable
    outside Blender (`tests/test_camera_lens.py`).
    """
    data.sensor_fit = "VERTICAL"
    # The same clamp `compute_framing` applies, so the lens and the distance
    # it computed always describe one camera.
    data.angle_y = math.radians(max(fov_deg, 1))
    data.clip_start = framing["near"]
    data.clip_end = framing["far"]
