"""The `render_animation` op: glTF bytes in, one MP4 or a PNG sequence out.

Two modes, and the params say which. Without `frame_times` this is the
original video render (D4, D5): the scene fps is set to `fps` before the
import, so a glTF animation channel timestamp `t` seconds lands on frame
`round(t * fps)`; `frame_start` and `frame_end` are frames in that timeline;
and when the glTF has no animation and `camera_mode` is `orbit`, the orbit
camera turns `orbit_degrees` across the frame range instead. Video uses
Blender's own FFMPEG writer (MPEG-4 container, H.264, `yuv420p`), so the
package needs no ffmpeg on PATH and no Mediabunny dependency.

With `frame_times` it is the timeline bake's sampled producer (design §D6):
one still per entry, each at that entry's model time and its own camera, into
the `frame_*` outputs the job declares. A trimmed, sped-up, reversed or
looped clip is not a run of consecutive scene frames, so the caller sends the
evaluated list and the op sets `frame_set` per entry; the frames are muxed
outside Blender, which is what lets an alpha bake pick a different encoder.
"""

import math
import os
import sys
import time

import bpy
from mathutils import Vector

from errors import BadJob, NoCamera, RenderFailed
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
    scene_cameras,
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
    frame_times = params.get("frame_times")
    if frame_times is not None:
        return _run_sampled(job, workdir, params, frame_times)
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


# ── Sampled mode (design §D6) ────────────────────────────────────────────────


def _frame_outputs(outputs):
    """Declared `frame_*` outputs, in the order they play.

    The caller declares one output per entry in `frame_times`, named
    `frame_%06d`, and the op writes the file each one names. Sorting by the
    logical name is what makes "in order" a property of the job rather than of
    a dictionary's iteration.
    """
    frames = sorted(
        (name, file) for name, file in outputs.items() if name.startswith("frame_")
    )
    if not frames:
        raise BadJob("a sampled render_animation declares no 'frame_*' outputs")
    return frames


def _select_animation(scene, name):
    """Leave only `name` playing; with `name` None every action stays on.

    The glTF importer lands each animation on its own NLA track named after it,
    all of them unmuted — which is the D2 default, every animation plays. A
    named selection mutes the rest.
    """
    if name is None:
        return
    found = False
    for obj in scene.objects:
        anim = obj.animation_data
        if anim is None:
            continue
        for track in anim.nla_tracks:
            match = track.name == name
            track.mute = not match
            found = found or match
    if not found:
        raise BadJob(
            "animation_name %r names no animation in this model" % (name,)
        )


def _scene_camera(scene, name):
    cameras = scene_cameras(scene)
    if not cameras:
        raise NoCamera(
            "camera_mode is 'scene' but the model has no camera; "
            "use 'auto' or 'orbit' instead"
        )
    if name is None:
        return cameras[0]
    for camera in cameras:
        if camera.name == name:
            return camera
    raise NoCamera(
        "scene_camera_name %r names no camera in this model (it has %s)"
        % (name, ", ".join(cam.name for cam in cameras))
    )


def _target_of(center, camera_params):
    """Where the orbit camera looks: the bounds center plus `target_offset`.

    The offset is authored in the three.js frame the clip's camera speaks, so
    it goes through the same (x, y, z) -> (x, -z, y) rotation `orbit_location`
    applies to the orbit offset itself.
    """
    offset = camera_params.get("target_offset")
    if not offset:
        return center
    return center + Vector((offset[0], -offset[2], offset[1]))


def _place_orbit_camera(camera_obj, center, radius, camera_params, aspect):
    location, framing = orbit_location(center, radius, camera_params, aspect)
    camera_obj.location = location
    camera_obj.data.angle = math.radians(camera_params["fov"])
    camera_obj.data.clip_start = framing["near"]
    camera_obj.data.clip_end = framing["far"]
    aim_camera(camera_obj, _target_of(center, camera_params))


def _run_sampled(job, workdir, params, frame_times):
    """One still per `frame_times` entry, each at its own model time and camera."""
    outputs = job["outputs"]
    frames = _frame_outputs(outputs)
    if len(frames) != len(frame_times):
        raise BadJob(
            "render_animation declares %d frame outputs for %d frame_times"
            % (len(frames), len(frame_times))
        )
    cameras = params.get("cameras") or []
    if cameras and len(cameras) != len(frame_times):
        raise BadJob(
            "render_animation carries %d cameras for %d frame_times"
            % (len(cameras), len(frame_times))
        )

    fps = max(1, int(params["fps"]))
    scene, meshes = import_model(job, workdir, fps=fps)
    scene.render.fps = fps
    width, height = apply_resolution(params)
    aspect = width / height
    center, radius = scene_bounds(meshes)
    _select_animation(scene, params.get("animation_name"))

    mode = params.get("camera_mode", "auto")
    first = cameras[0] if cameras else params
    if mode == "scene":
        camera_obj = _scene_camera(scene, first.get("scene_camera_name"))
    else:
        camera_obj = make_orbit_camera(scene, center, radius, first, aspect)
    scene.camera = camera_obj

    # Lights are placed once, from the first frame's camera, exactly as the
    # keyframed orbit places them: a preset that followed the camera would
    # relight the model every frame instead of turning it under fixed lamps.
    if not has_scene_lights(scene):
        apply_lighting_preset(scene, camera_obj, center, params)
    apply_world(params["background_color"], params["transparent"])
    apply_engine(params)
    scene.render.image_settings.file_format = "PNG"
    # A transparent bake needs the alpha channel PNG can carry; an opaque one
    # is muxed to yuv420p and would only pay for a channel nothing reads.
    scene.render.image_settings.color_mode = (
        "RGBA" if params["transparent"] else "RGB"
    )

    locations = []
    started = time.monotonic()
    for index, (_name, file_name) in enumerate(frames):
        model_time = float(frame_times[index])
        # The importer maps a glTF timestamp t onto frame `t * fps`, so the
        # model time is a frame plus a subframe rather than a whole frame:
        # `frame_set` is the only thing standing between a 24 fps scene and a
        # sample list that asks for 1/60 s steps.
        exact = model_time * fps
        whole = int(math.floor(exact))
        scene.frame_set(whole, subframe=exact - whole)
        if cameras and mode != "scene":
            _place_orbit_camera(camera_obj, center, radius, cameras[index], aspect)
        locations.append(tuple(round(value, 6) for value in camera_obj.location))
        scene.render.filepath = os.path.join(workdir, file_name)
        try:
            bpy.ops.render.render(write_still=True)
        except Exception as exc:
            raise RenderFailed(
                "sampled render failed at frame %d: %s" % (index, exc)
            )
        if not os.path.exists(os.path.join(workdir, file_name)):
            raise RenderFailed("frame %d finished but %r is missing" % (index, file_name))
        # The runner turns `Fra:` on stderr into progress; the sampled loop
        # writes it itself for the same reason the video path does.
        sys.stderr.write("Fra:%d\n" % (index + 1,))
        sys.stderr.flush()
    render_seconds = time.monotonic() - started

    stats = {
        "blender_version": bpy.app.version_string,
        "render_seconds": render_seconds,
        "frames": len(frames),
        "objects": len(meshes),
        "camera": camera_obj.name,
        "frame_camera_locations": locations,
    }
    return [name for name, _file in frames], stats
