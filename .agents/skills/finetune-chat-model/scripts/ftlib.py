"""Shared helpers for the fine-tuning analysis scripts: loading runs, error kinds.

A run spec is NAME=GLOB, with several globs joined by ';'. Each matching file is
JSONL written by `finetune-data.ts sample`: one line per run, keyed by taskId and
sample. Standard library only.
"""
import glob
import json
import re
import sys


def parse_spec(spec):
    if "=" not in spec:
        sys.exit(f"run spec {spec!r} must be NAME=GLOB[;GLOB...]")
    name, patterns = spec.split("=", 1)
    return name, [p for p in patterns.split(";") if p]


def load_lines(patterns):
    """Every run line of the files the globs match, in file order."""
    files = sorted({f for p in patterns for f in glob.glob(p)})
    if not files:
        sys.exit(f"no files match {';'.join(patterns)}")
    rows = []
    for path in files:
        with open(path) as fh:
            for line in fh:
                if not line.strip():
                    continue
                try:
                    rows.append(json.loads(line))
                except ValueError:
                    print(f"skipping a line that is not JSON in {path}", file=sys.stderr)
    return rows


def by_task_sample(rows):
    """{(taskId, sample): run}. A later line for the same key replaces an earlier one."""
    return {(r["taskId"], r.get("sample", 0)): r for r in rows}


def one_per_task(rows, sample=None):
    """{taskId: run}: the given sample, or the highest sample a task has."""
    out = {}
    for (task, s), run in sorted(by_task_sample(rows).items(), key=lambda kv: (kv[0][0], kv[0][1])):
        if sample is None or s == sample:
            out[task] = run
    return out


def load_runs(specs, sample=None):
    """{name: {taskId: run}} for NAME=GLOB specs, in the order given."""
    return {name: one_per_task(load_lines(p), sample) for name, p in map(parse_spec, specs)}


def tool_results(run):
    """The tool-result texts of the run's last request, in order, or [] without one."""
    final = run.get("finalRequest") or {}
    out = []
    for m in final.get("messages") or []:
        if m.get("role") == "tool":
            c = m.get("content")
            out.append(c if isinstance(c, str) else json.dumps(c))
    return out


def error_kind(text):
    """The kind of error a tool result reports, or None when it reports none.

    This is the error definition the v3 numbers use (GLM 0.26, epoch 6 0.42 of
    calls). Rates under other definitions differ, so compare rates only under
    this one.
    """
    try:
        j = json.loads(text)
    except ValueError:
        return "unparsed"
    if not isinstance(j, dict):
        return None
    e = j.get("error") if j.get("ok") is False else None
    if e is None:
        res = j.get("result")
        if isinstance(res, dict) and (
            res.get("ok") is False
            or res.get("error")
            or (isinstance(res.get("errors"), list)
                and any(isinstance(x, dict) and x.get("severity", "error") == "error" for x in res["errors"]))
        ):
            return "result.ok=false/validation"
        return None
    e = str(e)
    if "does not export" in e:
        return "import: wrong module/name"
    if "is not defined" in e:
        return "ReferenceError: not defined"
    if "revision" in e.lower() and "conflict" in e.lower():
        return "revision conflict"
    if e.startswith("SyntaxError"):
        return "SyntaxError"
    if e.startswith("TypeError"):
        if "not a function" in e:
            return "TypeError: not a function"
        return "TypeError: cannot read" if "cannot read" in e.lower() else "TypeError: other"
    if e.startswith("SandboxCapabilityError"):
        return "CapabilityError"
    if "timed out" in e.lower() or "timeout" in e.lower():
        return "timeout"
    m = re.match(r"(\w*Error)", e)
    return m.group(1) if m else "other"


def error_text(text):
    """The error message of a failed tool result, for listing, or '' when it did not fail."""
    if error_kind(text) is None:
        return ""
    try:
        j = json.loads(text)
        if isinstance(j, dict) and j.get("error"):
            return str(j["error"])
    except ValueError:
        pass
    return text


def error_sequence(run):
    """One bool per tool call of the run, True where its result is an error."""
    return [error_kind(t) is not None for t in tool_results(run)]


def family(task_id):
    parts = task_id.split("/")
    return parts[1] if parts[0] in ("val", "gen") and len(parts) > 2 else "suite:" + parts[0]
