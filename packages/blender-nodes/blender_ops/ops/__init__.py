"""Blender op modules. Stage 3 adds `prepare_for_engine` and `export_model`.

Each op exposes `run(job, workdir) -> (produced, stats)` where `job` is the
parsed `job.json` dict, `workdir` the scratch directory holding the inputs,
`produced` the logical output names written, and `stats` the fields for
`result.json`. An op raises `BlenderOpError` (or a subclass) on failure;
`run_job.py` turns it into `ok: false` with the code from the class.
"""

from ops.export_model import run as export_model
from ops.prepare_for_engine import run as prepare_for_engine
from ops.render_animation import run as render_animation
from ops.render_image import run as render_image
from ops.render_passes import run as render_passes

DISPATCH = {
    "render_image": render_image,
    "render_passes": render_passes,
    "render_animation": render_animation,
    "prepare_for_engine": prepare_for_engine,
    "export_model": export_model,
}

__all__ = ["DISPATCH"]
