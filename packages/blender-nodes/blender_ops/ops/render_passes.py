"""The `render_passes` op: glTF bytes in, control passes out (D4).

Same scene setup as `render_image` (`ops/common.py`), plus a compositor
node tree staging the raw float passes:

- `color`: the beauty render, straight through `scene.render.filepath`.
- `depth`: linear distance along the camera view axis, in scene units, from
  the Z pass. `png16` (default) normalizes to `[0, 65535]` between
  `depth_near` and `depth_far` — the min and max finite depth over the
  foreground pixels, both returned in stats — with background `65535`.
  `exr` keeps the raw float with background `+inf`, as Blender writes it.
- `normal`: camera-space normals from the Normal pass, `[-1, 1]` mapped to
  8-bit RGB, background `(128, 128, 255)`.
- `mask`: 8-bit image, foreground `255`, keyed on finite Z. D4 specifies
  the object index pass, but Blender 5.2 exposes no index socket on the
  `CompositorNodeRLayers` node the op must stage through (measured 5.2.1:
  `use_pass_object_index = True` is accepted yet the node lists only
  Image/Alpha/Depth/Mist/Normal, and the Render Result offers no
  Python-side pass access either), so both engines share the
  depth-finiteness gate instead. It agrees with the index pass on opaque
  geometry and disagrees for alpha-blended, holdout, and volume materials —
  a recorded deviation from D4, not an implementation of it.

`params["passes"]` selects the subset to produce; the op writes and reports
only those.

Blender 5.x notes (measured, not assumed):

- Compositing runs through `scene.compositing_node_group`; the legacy
  `use_nodes`/`node_tree` pair is deprecated and `Scene.node_tree` is gone.
  The legacy Math/Mix/MapRange nodes are gone too, so the tree stages RAW
  passes only and every contract mapping runs in Python (`depth.py`).
- A File Output node writes `<render-filepath>/<file_name>.<ext>`: the
  base is the current render filepath, and an absolute `file_name` is
  mangled (measured: `/tmp/wd/stage/x` lands at `/tmp/tmp/wd/stage/x.exr`
  under the factory `/tmp/` base). The op therefore points the render
  filepath at the workdir itself and stages through a relative subdir of
  it, so a killed run leaves nothing outside the workdir — which the
  runner deletes on every exit path.
- A File Output node ignores its item-level format and always writes
  multilayer EXR, so both staged passes are float EXR by construction.
"""

import os
import shutil
import time

import bpy
from mathutils import Vector

from depth import depth_range, normalize_to_u16, write_gray8_png, write_gray16_png
from depth import write_rgb8_png
from errors import BadJob, RenderFailed
from exr import read_exr_rgba
from ops.common import setup_render_scene

#: Staging directory for the raw float passes, inside the job's own
#: working directory: one Blender runs per op invocation, and the runner
#: deletes the workdir on every exit path, so no run can leak staged EXRs.
#: A relative name, so the File Output node resolves it under the workdir
#: the op points the render filepath at (see `run`).
_STAGE_SUBDIR = "nodetool-passes-stage"


#: Raw float passes the compositor stages.
_DEPTH_RAW_SLOT = "depth_raw"
_NORMAL_RAW_SLOT = "normal_raw"

#: Background constant for the normal map: exactly (128, 128, 255) in 8-bit.
NORMAL_BACKGROUND = (128, 128, 255)

#: EEVEE's no-hit Z sentinel, measured on Blender 5.2.1: the Z pass is
#: finite everywhere and off-geometry pixels read exactly this value.
#: Cycles writes +inf there instead, which the finiteness check below
#: already excludes. A real surface never reaches it (the far clip sits at
#: distance + radius * 10, single digits), so foreground is finite depth
#: below this value on both engines. This constant is an EEVEE behavior,
#: not a documented Blender API value: re-measure it if the version floor
#: moves.
BACKGROUND_DEPTH = 1e10


def _is_foreground(value):
    return value == value and value != float("inf") and value != float("-inf") and value < BACKGROUND_DEPTH


def _selected_passes(params):
    passes = params.get("passes", ["color", "depth", "normal", "mask"])
    if not isinstance(passes, list) or not passes:
        raise BadJob("render_passes needs a non-empty 'passes' list")
    known = {"color", "depth", "normal", "mask"}
    for name in passes:
        if name not in known:
            raise BadJob("unknown pass %r: choose from %s" % (name, sorted(known)))
    return passes


def _build_compositor():
    # Passes are enabled before the Render Layers node is created so its
    # sockets exist when linked. Both raw passes always stage: the mask and
    # the depth stats share the depth resolve, so depth is needed even when
    # only the mask is selected. `file_name` stays relative so it resolves
    # under the workdir the render filepath points at; an absolute value
    # would be mangled under the factory `/tmp/` base instead.
    scene = bpy.context.scene
    view_layer = scene.view_layers[0]
    view_layer.use_pass_z = True
    view_layer.use_pass_normal = True

    group = bpy.data.node_groups.new("NodeTool_Passes", "CompositorNodeTree")
    scene.compositing_node_group = group
    layers = group.nodes.new("CompositorNodeRLayers")

    for slot, socket in ((_DEPTH_RAW_SLOT, "Depth"), (_NORMAL_RAW_SLOT, "Normal")):
        node = group.nodes.new("CompositorNodeOutputFile")
        node.file_output_items.clear()
        node.file_output_items.new("RGBA", "Image")
        node.file_name = os.path.join(_STAGE_SUBDIR, slot)
        group.links.new(layers.outputs[socket], node.inputs[0])


def _camera_basis(camera_obj):
    """Rows of the world-to-camera rotation: maps world normals to camera space."""
    return camera_obj.matrix_world.to_3x3().transposed()


def _to_camera_space(basis, normal):
    vector = basis @ Vector(normal)
    length = vector.length
    if length < 1e-12:
        return None
    return (vector.x / length, vector.y / length, vector.z / length)


def _map_normal(rgb, basis):
    """World-space normal to 8-bit RGB in camera space, `[-1, 1]` to `[0, 255]`."""
    camera = _to_camera_space(basis, rgb)
    if camera is None:
        return None
    out = []
    for component in camera:
        scaled = component * 0.5 + 0.5
        if scaled < 0:
            scaled = 0
        elif scaled > 1:
            scaled = 1
        out.append(int(round(scaled * 255)))
    return out


def _collect_staged(workdir):
    """Move the staged EXRs into the workdir; fail loudly when one is missing."""
    stage_dir = os.path.join(workdir, _STAGE_SUBDIR)
    try:
        seen = sorted(os.listdir(stage_dir))
    except OSError:
        seen = []
    staged = {}
    for slot in (_DEPTH_RAW_SLOT, _NORMAL_RAW_SLOT):
        src = os.path.join(stage_dir, slot + ".exr")
        if not os.path.exists(src):
            # Name the directory: a missing stage file means the File Output
            # resolved elsewhere, and the guess list is what debugs it.
            raise RenderFailed(
                "compositor stage file %r is missing (staged: %s)"
                % (slot + ".exr", seen)
            )
        dst = os.path.join(workdir, slot + ".exr")
        os.replace(src, dst)
        staged[slot] = dst
    shutil.rmtree(stage_dir, ignore_errors=True)
    return staged


def run(job, workdir):
    """Run `render_passes`. Returns `(produced, stats)`."""
    params = job["job"]["params"]
    outputs = job["outputs"]
    passes = _selected_passes(params)
    for name in passes:
        if name not in outputs:
            raise BadJob("render_passes pass %r declares no output file" % (name,))
    depth_format = params.get("depth_format", "png16")
    if "depth" in passes and depth_format not in ("png16", "exr"):
        raise BadJob("unknown depth_format %r" % (depth_format,))

    scene, meshes, center, radius, camera_obj = setup_render_scene(job, workdir)
    stage_dir = os.path.join(workdir, _STAGE_SUBDIR)
    os.makedirs(stage_dir, exist_ok=True)
    try:
        return _run_passes(job, workdir, params, outputs, passes, depth_format,
                           scene, meshes, camera_obj)
    finally:
        # The stage subdir never lingers outside the workdir, and the runner
        # deletes the workdir itself on every exit path — including the
        # SIGKILL path where this `finally` never runs.
        shutil.rmtree(stage_dir, ignore_errors=True)


def _run_passes(job, workdir, params, outputs, passes, depth_format,
                scene, meshes, camera_obj):
    # The File Output base is the render filepath, snapshotted when the
    # node is created — so the filepath points at the workdir itself
    # (trailing separator: a directory, not a file) before the compositor
    # is built, and the relative stage names resolve inside it. Color is
    # saved from the Render Result afterwards, so its location stays exact
    # either way.
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.image_settings.color_depth = "8"
    scene.render.filepath = workdir + os.sep
    _build_compositor()

    started = time.monotonic()
    try:
        bpy.ops.render.render()
    except Exception as exc:
        raise RenderFailed("render failed: %s" % (exc,))
    render_seconds = time.monotonic() - started
    if "color" in passes:
        try:
            bpy.data.images["Render Result"].save_render(
                os.path.join(workdir, outputs["color"])
            )
        except Exception as exc:
            raise RenderFailed("color save failed: %s" % (exc,))

    produced = []
    stats = {
        "blender_version": bpy.app.version_string,
        "render_seconds": render_seconds,
        "objects": len(meshes),
        "camera": camera_obj.name,
    }
    if "color" in passes:
        produced.append("color")

    # Depth stages whenever the mask, the normal background, or depth
    # itself needs it: all three share the foreground resolve.
    need_depth = bool({"depth", "mask", "normal"} & set(passes))
    need_normal = "normal" in passes
    staged = (
        _collect_staged(workdir)
        if (need_depth or need_normal)
        else {}
    )

    depths, foreground, width, height = None, None, 0, 0
    if need_depth:
        width, height, depths, _depth_g, _depth_b = read_exr_rgba(
            staged[_DEPTH_RAW_SLOT]
        )
        # Foreground is finite Z below the no-hit sentinel: EEVEE writes
        # 1e10 off-geometry, Cycles +inf. The mask shares this resolve, so
        # no separate mask pass is needed on either engine.
        foreground = [_is_foreground(value) for value in depths]
    if "mask" in passes:
        assert depths is not None and foreground is not None
        write_gray8_png(
            os.path.join(workdir, outputs["mask"]),
            width,
            height,
            [255 if on else 0 for on in foreground],
        )
        produced.append("mask")
    if "normal" in passes:
        assert foreground is not None
        normal_width, normal_height, nx, ny, nz = read_exr_rgba(
            staged[_NORMAL_RAW_SLOT]
        )
        if (normal_width, normal_height) != (width, height):
            raise RenderFailed(
                "depth (%dx%d) and normal (%dx%d) sizes disagree"
                % (width, height, normal_width, normal_height)
            )
        # The Normal pass is world-space (measured: axis-aligned on an
        # orbit render); D4 wants camera space, so rotate by the camera.
        basis = _camera_basis(camera_obj)
        rgb = []
        for i in range(width * height):
            if not foreground[i]:
                rgb += list(NORMAL_BACKGROUND)
                continue
            mapped = _map_normal((nx[i], ny[i], nz[i]), basis)
            if mapped is None:
                rgb += list(NORMAL_BACKGROUND)
            else:
                rgb += mapped
        write_rgb8_png(os.path.join(workdir, outputs["normal"]), width, height, rgb)
        produced.append("normal")
    if "depth" in passes:
        assert depths is not None and foreground is not None
        try:
            near, far = depth_range(depths, foreground)
        except ValueError:
            raise RenderFailed("depth pass has no finite foreground depth")
        stats["depth_near"] = near
        stats["depth_far"] = far
        if depth_format == "exr":
            os.replace(
                staged[_DEPTH_RAW_SLOT], os.path.join(workdir, outputs["depth"])
            )
        else:
            values = normalize_to_u16(depths, foreground, near, far)
            write_gray16_png(
                os.path.join(workdir, outputs["depth"]), width, height, values
            )
            os.remove(staged[_DEPTH_RAW_SLOT])
        produced.append("depth")

    # Drop whichever staged EXR survived (unselected depth keeps its raw).
    for slot in (_DEPTH_RAW_SLOT, _NORMAL_RAW_SLOT):
        leftover = os.path.join(workdir, slot + ".exr")
        if os.path.exists(leftover):
            os.remove(leftover)
    return produced, stats
