"""The `render_animation` op: glTF bytes in, one MP4 out (D4, D5).

The scene fps is set to `fps` before the import, so a glTF animation
channel timestamp `t` seconds lands on frame `round(t * fps)`.
`frame_start` and `frame_end` are frames in that timeline. When the glTF has
no animation and `camera_mode` is `orbit`, the orbit camera turns
`orbit_degrees` across the frame range instead.

Video uses Blender's own FFMPEG writer (MPEG-4 container, H.264, `yuv420p`),
so the package needs no ffmpeg on PATH and no Mediabunny dependency.
"""

import os
import sys
import time

import bpy

from errors import BadJob, RenderFailed
from ops.common import (
    aim_camera,
    apply_engine,
    apply_lighting_preset,
    apply_resolution,
    apply_world,
    has_scene_lights,
    import_model,
    make_orbit_camera,
    orbit_location,
    scene_animations,
    scene_bounds,
    select_camera,
)


def _frame_range(params):
    start = int(params["frame_start"])
    end = int(params["frame_end"])
    if end < start:
        raise BadJob(
            "frame_end (%d) is before frame_start (%d)" % (end, start)
        )
    return start, end


def _action_fcurves(obj):
    """Every fcurve on the object's action, legacy or layered (Blender 5).

    Legacy actions carry `fcurves` directly; layered ones nest them in
    `layers[].strips[].channelbag(slot)`. Both shapes key the same way.
    """
    action = obj.animation_data.action
    if hasattr(action, "fcurves"):
        return list(action.fcurves)
    curves = []
    slot = obj.animation_data.action_slot
    for layer in action.layers:
        for strip in layer.strips:
            channelbag = getattr(strip, "channelbag", None)
            if channelbag is None:
                continue
            try:
                bag = channelbag(slot)
            except Exception:
                continue
            curves.extend(bag.fcurves)
    return curves


def _animate_orbit(scene, camera_obj, center, radius, params, aspect, start, end):
    """Keyframe the orbit camera across the frame range (D4)."""
    count = end - start + 1
    for frame in range(start, end + 1):
        fraction = (frame - start) / (count - 1) if count > 1 else 0.0
        angled = dict(params, azimuth=params["azimuth"] + params["orbit_degrees"] * fraction)
        location, _framing = orbit_location(center, radius, angled, aspect)
        camera_obj.location = location
        aim_camera(camera_obj, center)
        camera_obj.keyframe_insert(data_path="location", frame=frame)
        camera_obj.keyframe_insert(data_path="rotation_euler", frame=frame)
    for curve in _action_fcurves(camera_obj):
        for point in curve.keyframe_points:
            point.interpolation = "LINEAR"


def run(job, workdir):
    """Run `render_animation`. Returns `(produced, stats)`."""
    params = job["job"]["params"]
    outputs = job["outputs"]
    if "video" not in outputs:
        raise BadJob("render_animation declares no 'video' output")
    start, end = _frame_range(params)
    fps = max(1, int(params["fps"]))

    scene, meshes = import_model(job, workdir, fps=fps)
    # Re-assert the fps after the import: the mapping the importer used is
    # the one this scene holds for the render.
    scene.render.fps = fps
    width, height = apply_resolution(params)
    aspect = width / height
    center, radius = scene_bounds(meshes)

    animated = scene_animations(scene)
    mode = params.get("camera_mode", "auto")
    if not animated and mode == "orbit":
        camera_obj = make_orbit_camera(scene, center, radius, params, aspect)
        scene.camera = camera_obj
        _animate_orbit(scene, camera_obj, center, radius, params, aspect, start, end)
    else:
        camera_obj = select_camera(scene, center, radius, params, aspect)
        scene.camera = camera_obj

    if not has_scene_lights(scene):
        apply_lighting_preset(scene, camera_obj, center, params)
    apply_world(params["background_color"], params["transparent"])
    apply_engine(params)

    scene.frame_start = start
    scene.frame_end = end
    video_path = os.path.join(workdir, outputs["video"])
    if not video_path.lower().endswith(".mp4"):
        raise BadJob("render_animation output %r must end in .mp4" % (outputs["video"],))
    scene.render.filepath = video_path
    # Blender 5.x splits image and video output behind `media_type`: movie
    # formats stay unsettable until the type flips to VIDEO (measured).
    scene.render.image_settings.media_type = "VIDEO"
    scene.render.image_settings.file_format = "FFMPEG"
    scene.render.ffmpeg.format = "MPEG4"
    scene.render.ffmpeg.codec = "H264"
    scene.render.ffmpeg.constant_rate_factor = "MEDIUM"
    scene.render.ffmpeg.ffmpeg_preset = "GOOD"

    # Blender 5.x no longer prints `Fra:<n>` progress lines (it logs `Video
    # append frame N` on stdout, which the runner does not watch), so the op
    # reports each written frame itself on stderr. The local runner turns
    # those into `onProgress` calls through `onStderrLine` (D6).
    def _report_frame(*args):
        scene = args[0] if args else None
        frame = scene.frame_current if scene is not None else -1
        sys.stderr.write("Fra:%d\n" % (frame,))
        sys.stderr.flush()

    handlers = bpy.app.handlers
    handlers.render_write.append(_report_frame)
    started = time.monotonic()
    try:
        bpy.ops.render.render(animation=True)
    except Exception as exc:
        raise RenderFailed("animation render failed: %s" % (exc,))
    finally:
        if _report_frame in handlers.render_write:
            handlers.render_write.remove(_report_frame)
    render_seconds = time.monotonic() - started

    if not os.path.exists(video_path):
        raise RenderFailed("animation finished but %r is missing" % (outputs["video"],))
    stats = {
        "blender_version": bpy.app.version_string,
        "render_seconds": render_seconds,
        "frames": end - start + 1,
        "objects": len(meshes),
        "camera": camera_obj.name,
    }
    return ["video"], stats
