"""The `export_model` op: glTF bytes in, one exported file out (D8).

`params["format"]` is `fbx`, `obj`, or `usd`. The node persists the bytes
through `context.createAsset` and returns an `AssetRef` — never a
`Model3DRef`, which keeps meaning glTF everywhere. GLB is deliberately not
a format here: `prepare_for_engine` and `FormatConverter` already produce a
`Model3DRef` for it.

The operators are the ones Blender 5.x ships: the FBX IO add-on (enabled
under `--factory-startup`) and the core `wm.obj_export` / `wm.usd_export`
operators, which need no add-on. A call that raises (a failing poll, a
rejected scene) surfaces as `export_failed` with the operator's message.
"""

import os
import time

import bpy

from errors import BadJob, ExportFailed
from ops.common import import_model


_FORMAT_OPS = {
    "fbx": "export_scene.fbx",
    "obj": "wm.obj_export",
    "usd": "wm.usd_export",
}


def _exporter(format):
    try:
        dotted = _FORMAT_OPS[format]
    except KeyError:
        raise BadJob(
            "unknown export format %r: choose from %s" % (format, sorted(_FORMAT_OPS))
        )
    group, name = dotted.split(".")
    return getattr(getattr(bpy.ops, group), name)


def run(job, workdir):
    """Run `export_model`. Returns `(produced, stats)`."""
    params = job["job"]["params"]
    outputs = job["outputs"]
    if "file" not in outputs:
        raise BadJob("export_model declares no 'file' output")
    format = params.get("format")
    if format not in _FORMAT_OPS:
        raise BadJob(
            "unknown export format %r: choose from %s" % (format, sorted(_FORMAT_OPS))
        )

    # The empty scene gates as `no_geometry` inside `import_model`, before
    # any export time is spent.
    _scene, meshes = import_model(job, workdir)

    out_path = os.path.join(workdir, outputs["file"])
    export = _exporter(format)

    started = time.monotonic()
    try:
        result = export(filepath=out_path)
    except Exception as exc:
        raise ExportFailed("%s export failed: %s" % (format, exc))
    render_seconds = time.monotonic() - started

    if "FINISHED" not in result:
        raise ExportFailed("%s exporter rejected the scene" % (format,))
    if not os.path.exists(out_path):
        raise ExportFailed(
            "%s export finished but %r is missing" % (format, outputs["file"])
        )
    stats = {
        "blender_version": bpy.app.version_string,
        "render_seconds": render_seconds,
        "objects": len(meshes),
    }
    return ["file"], stats
