"""Blender op modules. Stage 2 adds `render_passes` and `render_animation`.

Each op exposes `run(job, workdir) -> (produced, stats)` where `job` is the
parsed `job.json` dict, `workdir` the scratch directory holding the inputs,
`produced` the logical output names written, and `stats` the fields for
`result.json`. An op raises `BlenderOpError` (or a subclass) on failure;
`run_job.py` turns it into `ok: false` with the code from the class.
"""

from ops.render_animation import run as render_animation
from ops.render_image import run as render_image
from ops.render_passes import run as render_passes

DISPATCH = {
    "render_image": render_image,
    "render_passes": render_passes,
    "render_animation": render_animation,
}

__all__ = ["DISPATCH"]
