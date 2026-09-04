"""Blender entry point: read `job.json`, run the op, always write `result.json`.

Invocation (built by `LocalBlenderRunner`):

    blender -b --factory-startup --disable-autoexec \\
        --python-exit-code 64 --python <asset_dir>/run_job.py -- job.json

`job.json` carries the `BlenderJob` (D4): version, logical input/output file
names, and `{ op, params }`. `result.json` carries the `BlenderResult`:
`ok: true` with the produced names and stats, or `ok: false` with a code and
a message. Exit code 64 is reserved for "the script raised", distinct from
Blender's own crash codes.

`sys.excepthook` is installed before the op modules are imported, so an
import error also lands in `result.json` instead of only on stderr.
"""

import json
import os
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from errors import BlenderOpError  # noqa: E402 — stdlib-only, cannot fail

JOB_VERSION = 1


def _result_path():
    return os.path.join(os.getcwd(), "result.json")


def _write_result(payload):
    try:
        with open(_result_path(), "w", encoding="utf-8") as handle:
            json.dump(payload, handle)
    except Exception as exc:  # noqa: BLE001 — last resort must not raise
        sys.stderr.write("run_job: cannot write result.json: %s\n" % (exc,))


def _code_of(exc):
    code = getattr(exc, "code", None)
    if isinstance(code, str) and code:
        return code
    return "render_failed"


def _install_excepthook():
    def _hook(exc_type, exc_value, exc_tb):
        message = "".join(
            traceback.format_exception(exc_type, exc_value, exc_tb)
        ).strip()[-2000:]
        _write_result(
            {"ok": False, "error": {"code": _code_of(exc_value), "message": message}}
        )
        sys.__excepthook__(exc_type, exc_value, exc_tb)

    sys.excepthook = _hook


_install_excepthook()

from ops import DISPATCH  # noqa: E402 — after the excepthook on purpose


def _job_path():
    candidates = [arg for arg in sys.argv[1:] if arg != "--"]
    if candidates:
        path = candidates[-1]
    else:
        path = "job.json"
    if not os.path.isabs(path):
        path = os.path.join(os.getcwd(), path)
    return path


def main():
    path = _job_path()
    try:
        with open(path, encoding="utf-8") as handle:
            job = json.load(handle)
    except Exception as exc:
        raise BlenderOpError("cannot read job.json: %s" % (exc,), "bad_job")

    if not isinstance(job, dict) or job.get("version") != JOB_VERSION:
        version = job.get("version") if isinstance(job, dict) else None
        raise BlenderOpError(
            "unsupported job version %r: run_job.py speaks version %d"
            % (version, JOB_VERSION),
            "bad_job",
        )

    inner = job.get("job")
    if not isinstance(inner, dict) or not isinstance(inner.get("op"), str):
        raise BlenderOpError("job carries no op name", "bad_job")
    op_name = inner["op"]
    run = DISPATCH.get(op_name)
    if run is None:
        raise BlenderOpError(
            "unknown op %r: this run_job.py serves %s" % (op_name, sorted(DISPATCH)),
            "bad_job",
        )

    produced, stats = run(job, os.getcwd())
    _write_result({"ok": True, "produced": produced, "stats": stats})


if __name__ == "__main__":
    main()
