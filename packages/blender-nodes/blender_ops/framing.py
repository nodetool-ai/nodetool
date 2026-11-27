"""Auto-framing math for the Blender orbit camera.

A line-for-line port of `computeFraming` and `orbitOffset` from
`packages/video-nodes/src/nodes/model3d/render3d-core.ts`: same math, same
names (snake_cased). The two sides are pinned to the same golden camera
position by `tests/framing.test.ts` (TypeScript) and
`blender_ops/tests/test_framing.py` (this interpreter).

The offsets are in the three.js convention (Y up). `ops/render_image.py`
rotates them rigidly into Blender space when placing the camera; the
functions here stay identical so the cross-language pin holds.

The free camera functions at the end port `computeFreeClipPlanes` from the
render core and `model3dFreeCameraBasis` from `packages/timeline`, pinned by
`tests/free-camera.test.ts` and `blender_ops/tests/test_free_camera.py`.

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


FREE_CAMERA_POSITION = (0.0, 1.6, 5.0)
FREE_CAMERA_TARGET = (0.0, 1.0, 0.0)


def free_clip_planes(distance_to_center, radius):
    """Clip planes for a free camera, from the bounds as seen from the eye.

    A port of `computeFreeClipPlanes` in `render3d-core.ts`.
    """
    safe_radius = max(radius, 1e-6)
    distance = max(distance_to_center, 0)
    far = distance + safe_radius * 4
    return {
        "near": max(distance - safe_radius * 4, far / 1000, 1e-4),
        "far": far,
    }


def _cross(a, b):
    return (
        a[1] * b[2] - a[2] * b[1],
        a[2] * b[0] - a[0] * b[2],
        a[0] * b[1] - a[1] * b[0],
    )


def _unit(v, fallback):
    size = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    if size <= 1e-6:
        return fallback
    return (v[0] / size, v[1] / size, v[2] / size)


def free_camera_axes(position, target, roll_deg):
    """The free camera's `forward`, `right` and `up` in the three.js frame.

    A port of `model3dFreeCameraBasis` in `packages/timeline/src/model3d.ts`.
    A positive roll turns the camera counter-clockwise around its view axis as
    seen from behind it, so the horizon turns clockwise in the picture.
    """
    to_target = (
        target[0] - position[0],
        target[1] - position[1],
        target[2] - position[2],
    )
    forward = _unit(to_target, (0.0, 0.0, -1.0))
    right0 = _unit(_cross(forward, (0.0, 1.0, 0.0)), (1.0, 0.0, 0.0))
    up0 = _cross(right0, forward)
    cos = math.cos(math.radians(roll_deg))
    sin = math.sin(math.radians(roll_deg))
    right = tuple(cos * right0[i] + sin * up0[i] for i in range(3))
    up = tuple(cos * up0[i] - sin * right0[i] for i in range(3))
    return {"forward": forward, "right": right, "up": up}


def three_to_blender(v):
    """Rigid three.js (Y up) to Blender (Z up) rotation: (x, y, z) -> (x, -z, y)."""
    return (v[0], -v[2], v[1])


def free_camera_pose(params):
    """The eye, target and roll a `free` camera's params describe."""
    return {
        "position": tuple(params.get("position") or FREE_CAMERA_POSITION),
        "target": tuple(params.get("target") or FREE_CAMERA_TARGET),
        "roll": float(params.get("roll") or 0.0),
    }


def free_camera_matrix_columns(params):
    """Blender-space location and rotation columns of a `free` camera.

    Returns `(location, (x_axis, y_axis, z_axis))`. A Blender camera looks
    down its local -Z with +Y up, so the columns are right, up and the
    reverse of forward.
    """
    pose = free_camera_pose(params)
    axes = free_camera_axes(pose["position"], pose["target"], pose["roll"])
    forward = three_to_blender(axes["forward"])
    return (
        three_to_blender(pose["position"]),
        (
            three_to_blender(axes["right"]),
            three_to_blender(axes["up"]),
            (-forward[0], -forward[1], -forward[2]),
        ),
    )
