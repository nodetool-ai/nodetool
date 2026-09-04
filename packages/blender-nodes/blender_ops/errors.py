"""Error classes shared by `run_job.py` and the op modules.

An op failure carries its `result.json` error code on the class, so
`run_job.py` turns it into `ok: false` with the code from the class and the
message from the exception. Imported before `sys.excepthook` is installed:
this module imports nothing, so the import itself cannot fail.
"""


class BlenderOpError(Exception):
    """An op failure with a `result.json` error code on the class."""

    code = "render_failed"

    def __init__(self, message="", code=None):
        super().__init__(message)
        if code is not None:
            self.code = code


class BadJob(BlenderOpError):
    code = "bad_job"


class ImportFailed(BlenderOpError):
    code = "import_failed"


class NoGeometry(BlenderOpError):
    code = "no_geometry"


class NoCamera(BlenderOpError):
    code = "no_camera"


class RenderFailed(BlenderOpError):
    code = "render_failed"


class ExportFailed(BlenderOpError):
    code = "export_failed"
