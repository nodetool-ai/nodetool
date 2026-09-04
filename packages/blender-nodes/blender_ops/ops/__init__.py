"""Blender op modules. Stage 1b ships `render_image` only.

Each op exposes `run(job, workdir) -> (produced, stats)` where `job` is the
parsed `job.json` dict, `workdir` the scratch directory holding the inputs,
`produced` the logical output names written, and `stats` the fields for
`result.json`. An op raises `BlenderOpError` (or a subclass) on failure;
`run_job.py` turns it into `ok: false` with the code from the class.
"""

from ops.render_image import run as render_image

DISPATCH = {
    "render_image": render_image,
}

__all__ = ["DISPATCH"]
