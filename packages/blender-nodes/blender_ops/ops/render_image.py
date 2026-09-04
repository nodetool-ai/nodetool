"""The `render_image` op: glTF bytes in, one PNG out.

Scene setup is the shared render-op setup from `common.py` (D5). A glTF
with no mesh is `no_geometry`, raised before any render time.
"""

import os
import time

import bpy

from errors import BadJob, RenderFailed
from ops.common import setup_render_scene


def run(job, workdir):
    """Run `render_image`. Returns `(produced, stats)`."""
    outputs = job["outputs"]
    if "image" not in outputs:
        raise BadJob("render_image declares no 'image' output")

    scene, meshes, center, radius, camera_obj = setup_render_scene(job, workdir)

    scene.render.image_settings.file_format = "PNG"
    out_path = os.path.join(workdir, outputs["image"])
    scene.render.filepath = out_path

    started = time.monotonic()
    try:
        bpy.ops.render.render(write_still=True)
    except Exception as exc:
        raise RenderFailed("render failed: %s" % (exc,))
    render_seconds = time.monotonic() - started

    stats = {
        "blender_version": bpy.app.version_string,
        "render_seconds": render_seconds,
        "objects": len(meshes),
        "camera": camera_obj.name,
    }
    return ["image"], stats
