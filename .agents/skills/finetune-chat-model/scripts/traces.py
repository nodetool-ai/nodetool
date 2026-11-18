#!/usr/bin/env python3
"""Trace analysis for sampled chat runs: where tool calls fail and what follows.

usage: traces.py rates NAME=GLOB ...
       traces.py kinds [--sft NAME=FILE] [--top N] NAME=GLOB ...
       traces.py dump [--occurrence N] [--max-len N] GLOB TASK_ID
       traces.py task-errors TASK_ID NAME=GLOB ...
       traces.py grep [--in code|results] REGEX NAME=GLOB ...

rates        Tool-call error rate by call index (1-5, 6-10, 11-20, 21-50), the
             overall rate, how often the call after an error succeeds, runs with
             an error streak of 3 or more, and passes by run length in replies.
kinds        Error kinds per 100 calls, one column per run. --sft adds a column
             for a training file from `finetune-data.ts export`. --top lists the
             most common messages filed under "other".
dump         One run of TASK_ID, message by message: the request, each action's
             code and each tool result.
task-errors  For TASK_ID in every run: pass or fail, the failed checks, and the
             tool results that are errors.
grep         Runs per family whose assistant code (or tool results) match REGEX.

Runs come from NAME=GLOB specs, as in compare.py. Each task keeps its highest
sample. A call is an error when ftlib.error_kind says so, which is the
definition the v3 numbers use: compare error rates only under one definition.
"""
import argparse
import collections
import json
import os
import re
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ftlib import (  # noqa: E402
    error_kind, error_sequence, error_text, family, load_lines, load_runs, tool_results)

BUCKETS = [(1, 5), (6, 10), (11, 20), (21, 50)]


def longest_streak(seq):
    best = cur = 0
    for e in seq:
        cur = cur + 1 if e else 0
        best = max(best, cur)
    return best


def cmd_rates(args):
    runs = load_runs(args.runs)
    print("tool-call error rate by call index (calls in bucket)")
    for name, r in runs.items():
        seqs = [error_sequence(x) for x in r.values()]
        cells = []
        for a, b in BUCKETS:
            v = [s[i - 1] for s in seqs for i in range(a, b + 1) if len(s) >= i]
            cells.append(f"{sum(v) / max(1, len(v)):.2f} (n={len(v)})")
        recover = [not s[i + 1] for s in seqs for i in range(len(s) - 1) if s[i]]
        calls = sum(len(s) for s in seqs)
        errs = sum(sum(s) for s in seqs)
        streaks = sum(longest_streak(s) >= 3 for s in seqs)
        print(f"  {name:8} {' | '.join(cells)}   errors {errs}/{calls}={errs / max(1, calls):.2f}"
              f"  next call ok after an error {sum(recover) / max(1, len(recover)):.2f}"
              f"  runs with a 3+ error streak {streaks}")
    print("\npasses by run length in replies")
    for name, r in runs.items():
        cells = collections.defaultdict(lambda: [0, 0])
        for x in r.values():
            n = len(x.get("replies", []))
            label = "1-5" if n <= 5 else "6-10" if n <= 10 else "11-20" if n <= 20 else "21+"
            cells[label][0] += bool(x["achieved"])
            cells[label][1] += 1
        print(f"  {name:8} " + "  ".join(f"{b} {cells[b][0]}/{cells[b][1]}" for b in ["1-5", "6-10", "11-20", "21+"]))
    return 0


def cmd_kinds(args):
    columns = {}
    other = []
    for name, r in load_runs(args.runs).items():
        counts, calls = collections.Counter(), 0
        for x in r.values():
            for t in tool_results(x):
                calls += 1
                k = error_kind(t)
                if k:
                    counts[k] += 1
                    if k == "other":
                        other.append(error_text(t))
        columns[name] = (counts, calls)
    if args.sft:
        name, path = args.sft.split("=", 1)
        counts, calls = collections.Counter(), 0
        for line in open(path):
            if not line.strip():
                continue
            for m in json.loads(line)["messages"]:
                if m.get("role") == "tool":
                    calls += 1
                    c = m.get("content")
                    k = error_kind(c if isinstance(c, str) else json.dumps(c))
                    if k:
                        counts[k] += 1
        columns[name] = (counts, calls)
    first = next(iter(columns.values()))[0]
    kinds = sorted({k for c, _ in columns.values() for k in c}, key=lambda k: -first[k])
    print(f"{'error kind (per 100 calls)':30}" + "".join(f"{n:>10}" for n in columns))
    for k in kinds:
        print(f"{k:30}" + "".join(f"{100 * c[k] / max(1, n):10.1f}" for c, n in columns.values()))
    print(f"{'calls':30}" + "".join(f"{n:10}" for _, n in columns.values()))
    print(f"{'error share':30}" + "".join(f"{sum(c.values()) / max(1, n):10.2f}" for c, n in columns.values()))
    if args.top:
        print("\nmost common 'other' errors, digits and ids replaced by #:")
        normal = collections.Counter(re.sub(r"[0-9a-f]{8,}|\d+", "#", e[:110]) for e in other)
        for e, n in normal.most_common(args.top):
            print(f"  {n:4} {e}")
    return 0


def cmd_dump(args):
    seen = 0
    for run in load_lines([args.glob]):
        if run["taskId"] != args.task:
            continue
        if seen != args.occurrence:
            seen += 1
            continue
        ml = args.max_len
        print("MODEL", run.get("model"), "SAMPLE", run.get("sample"), "ACHIEVED", run["achieved"])
        print("OUTCOMES", json.dumps(run.get("outcomes")))
        print("OBJECTIVE", run["objective"])
        for i, m in enumerate((run.get("finalRequest") or {}).get("messages") or []):
            role = m.get("role")
            content = m.get("content")
            content = content if isinstance(content, str) else json.dumps(content)
            if role == "system":
                print(i, "SYSTEM", len(content or ""), "chars")
            elif role == "user":
                print(i, "USER", (content or "")[:ml])
            elif role == "assistant":
                print(i, "ASSISTANT", (content or "")[:600])
                for tc in m.get("tool_calls") or []:
                    a = tc["function"].get("arguments")
                    if isinstance(a, str):
                        try:
                            a = json.loads(a)
                        except ValueError:
                            pass
                    code = a.get("code") if isinstance(a, dict) and "code" in a else a
                    print("   CALL", tc["function"]["name"], str(code)[:ml])
            elif role == "tool":
                print(i, "TOOL", (content or "")[:ml])
        print("STOPS", [(x.get("status"), x.get("doneReason")) for x in run.get("replies", [])])
        return 0
    sys.exit(f"no run {args.occurrence} of {args.task} in {args.glob}")


def cmd_task_errors(args):
    for name, r in load_runs(args.runs).items():
        run = r.get(args.task)
        if run is None:
            print(f"== {name}: no run")
            continue
        failed = [o["name"] for o in run.get("outcomes", []) if not o.get("passed")]
        print(f"== {name}: {'PASS' if run['achieved'] else 'FAIL'} failed checks {failed}")
        for i, t in enumerate(tool_results(run)):
            if error_kind(t):
                print(f"   call {i + 1}: {error_text(t)[:400]}".replace("\\n", " "))
    return 0


def assistant_code(run):
    parts = []
    for m in (run.get("finalRequest") or {}).get("messages") or []:
        if m.get("role") != "assistant":
            continue
        for tc in m.get("tool_calls") or []:
            a = tc["function"].get("arguments")
            if isinstance(a, str):
                try:
                    a = json.loads(a)
                except ValueError:
                    pass
            parts.append(a.get("code") if isinstance(a, dict) and "code" in a else json.dumps(a))
    return "\n".join(str(p) for p in parts)


def cmd_grep(args):
    rx = re.compile(args.regex)
    for name, r in load_runs(args.runs).items():
        per = collections.defaultdict(lambda: [0, 0])
        for t, run in r.items():
            text = assistant_code(run) if args.where == "code" else "\n".join(tool_results(run))
            per[family(t)][0] += bool(rx.search(text))
            per[family(t)][1] += 1
        total = sum(v[0] for v in per.values())
        print(f"== {name}: {total} of {len(r)} runs match in {args.where}")
        for fam in sorted(per):
            if per[fam][0]:
                print(f"   {fam:30} {per[fam][0]}/{per[fam][1]}")
    return 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="command", required=True)
    p = sub.add_parser("rates")
    p.add_argument("runs", nargs="+", metavar="NAME=GLOB")
    p = sub.add_parser("kinds")
    p.add_argument("runs", nargs="+", metavar="NAME=GLOB")
    p.add_argument("--sft", metavar="NAME=FILE")
    p.add_argument("--top", type=int, default=0)
    p = sub.add_parser("dump")
    p.add_argument("glob")
    p.add_argument("task")
    p.add_argument("--occurrence", type=int, default=0)
    p.add_argument("--max-len", type=int, default=1500)
    p = sub.add_parser("task-errors")
    p.add_argument("task")
    p.add_argument("runs", nargs="+", metavar="NAME=GLOB")
    p = sub.add_parser("grep")
    p.add_argument("regex")
    p.add_argument("runs", nargs="+", metavar="NAME=GLOB")
    p.add_argument("--in", dest="where", choices=["code", "results"], default="code")
    args = ap.parse_args()
    return {"rates": cmd_rates, "kinds": cmd_kinds, "dump": cmd_dump,
            "task-errors": cmd_task_errors, "grep": cmd_grep}[args.command](args)


if __name__ == "__main__":
    sys.exit(main())
