#!/usr/bin/env python3
"""Pass counts on the validation split: a candidate run against every other run.

usage: compare.py [--candidate NAME] [--sample N] [--list] NAME=GLOB[;GLOB] ...

  python3 -I compare.py base='eval-base/*.jsonl' glm='teacher-val/*.jsonl' \\
      v3e6='eval-v3e6/*.jsonl' --candidate v3e6

Prints, for every run: tasks, passes and the mean per run of the behaviour
counters (rep repeated calls, ref ReferenceErrors, imp refused imports, op
unknown storyboard ops, rev revision conflicts). Then, on the tasks every run
has, each run's passes and the candidate's wins and losses per task against
each other run, then passes per task family. --list prints every task's result
per run (P or F, tool calls, replies).

A run file may hold several samples per task. Without --sample, each task keeps
its highest sample. For two-sample comparisons use significance.py, which pairs
runs by task and sample. Overall rates count only tasks every run has.
The candidate defaults to the last run given.
"""
import argparse
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ftlib import family, load_runs  # noqa: E402

COUNTERS = ["repeatedCalls", "referenceErrors", "importErrors", "unknownOps", "revisionConflicts"]
SHORT = {"repeatedCalls": "rep", "referenceErrors": "ref", "importErrors": "imp",
         "unknownOps": "op", "revisionConflicts": "rev"}
# The patterns of packages/websocket/src/finetune/run-behaviour.ts, for lines
# written before the sampler stored the counters.
RESULT_PATTERNS = {
    "referenceErrors": re.compile(r"ReferenceError"),
    "importErrors": re.compile(
        r"is not defined in this action\. Nothing carries over"
        r"|which that module does not export"
        r"|which is not a NodeTool capability module"),
    "unknownOps": re.compile(r"ops\[\d+\] names .{1,200}?; expected one of"),
    "revisionConflicts": re.compile(r"revision[ _]conflict", re.IGNORECASE),
}
LABEL_ARGUMENTS = {"execute_code": {"title", "description"}}


def normalize_code(code):
    """Comments dropped, whitespace reduced, string literals kept verbatim."""
    parts, plain, i = [], [], 0

    def flush():
        text = re.sub(r"\s+", " ", "".join(plain))
        parts.append(re.sub(r" ?([^\w$ ]) ?", r"\1", text))
        plain.clear()

    while i < len(code):
        ch, nxt = code[i], code[i + 1:i + 2]
        if ch == "/" and nxt == "/":
            end = code.find("\n", i)
            plain.append(" ")
            i = len(code) if end == -1 else end
        elif ch == "/" and nxt == "*":
            end = code.find("*/", i + 2)
            plain.append(" ")
            i = len(code) if end == -1 else end + 2
        elif ch in "\"'`":
            j = i + 1
            while j < len(code) and code[j] != ch:
                j += 2 if code[j] == "\\" else 1
            flush()
            parts.append(code[i:j + 1])
            i = j + 1
        else:
            plain.append(ch)
            i += 1
    flush()
    return "".join(parts).strip()


def call_key(name, args):
    if isinstance(args, str):
        try:
            args = json.loads(args)
        except ValueError:
            pass
    if isinstance(args, dict):
        labels = LABEL_ARGUMENTS.get(name, set())
        args = {k: normalize_code(v) if k == "code" and isinstance(v, str) else v
                for k, v in args.items() if k not in labels}
    return name + "\n" + json.dumps(args, sort_keys=True, separators=(",", ":"))


def behaviour(run):
    """The run's counters: stored on the line, else recomputed, else None."""
    if all(k in run for k in COUNTERS):
        return {k: run[k] for k in COUNTERS}
    final = run.get("finalRequest")
    if not final:
        return None
    out = dict.fromkeys(COUNTERS, 0)
    previous = None
    for entry in run.get("replies", []):
        for call in entry["reply"].get("tool_calls") or []:
            key = call_key(call["function"]["name"], call["function"].get("arguments"))
            out["repeatedCalls"] += key == previous
            previous = key
    for message in final["messages"]:
        if message.get("role") != "tool":
            continue
        text = message.get("content") or ""
        text = text if isinstance(text, str) else json.dumps(text)
        for counter, pattern in RESULT_PATTERNS.items():
            out[counter] += bool(pattern.search(text))
    return out


def means(rows):
    known = [b for b in (behaviour(r) for r in rows) if b is not None]
    if not known:
        return "  ".join(f"{SHORT[k]} -" for k in COUNTERS)
    return "  ".join(f"{SHORT[k]} {sum(b[k] for b in known) / len(known):.2f}" for k in COUNTERS)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("runs", nargs="+", metavar="NAME=GLOB")
    ap.add_argument("--candidate")
    ap.add_argument("--sample", type=int)
    ap.add_argument("--list", action="store_true")
    args = ap.parse_args()

    runs = load_runs(args.runs, args.sample)
    names = list(runs)
    cand = args.candidate or names[-1]
    if cand not in runs:
        sys.exit(f"--candidate {cand} is not one of {', '.join(names)}")
    width = max(5, *(len(n) for n in names))

    print("means per run: rep repeated calls, ref ReferenceErrors, imp refused imports,")
    print("op unknown storyboard ops, rev revision conflicts, - where no run has them")
    for name, r in runs.items():
        print(f"{name:{width}} {len(r):3} tasks, {sum(x['achieved'] for x in r.values()):3} passed   {means(r.values())}")

    shared = set.intersection(*(set(r) for r in runs.values()))
    print(f"\non the {len(shared)} tasks every run has:")
    for name in names:
        passed = sum(runs[name][t]["achieved"] for t in shared)
        print(f"  {name:{width}} {passed}/{len(shared)}   {means(runs[name][t] for t in shared)}")
    for other in names:
        if other == cand:
            continue
        both = set(runs[cand]) & set(runs[other])
        won = sorted(t for t in both if runs[cand][t]["achieved"] and not runs[other][t]["achieved"])
        lost = sorted(t for t in both if runs[other][t]["achieved"] and not runs[cand][t]["achieved"])
        print(f"\n  {cand} vs {other} on {len(both)} tasks: +{len(won)} -{len(lost)}")
        print(f"    wins:   {' '.join(won) or '-'}")
        print(f"    losses: {' '.join(lost) or '-'}")

    by_family = defaultdict(lambda: defaultdict(lambda: [0, 0]))
    for name, r in runs.items():
        for t, x in r.items():
            cell = by_family[family(t)][name]
            cell[0] += x["achieved"]
            cell[1] += 1
    print("\nper family (passed/ran):")
    print(f"  {'family':30} " + " ".join(f"{n:>{max(7, len(n))}}" for n in names))
    for fam in sorted(by_family):
        row = by_family[fam]
        cells = []
        for n in names:
            text = f"{row[n][0]}/{row[n][1]}" if n in row else "-"
            cells.append(f"{text:>{max(7, len(n))}}")
        print(f"  {fam:30} " + " ".join(cells))

    if args.list:
        print("\nper task (P/F, tool calls, replies):")
        for t in sorted(set().union(*runs.values())):
            cells = []
            for n in names:
                x = runs[n].get(t)
                cells.append("-" if x is None else
                             f"{'P' if x['achieved'] else 'F'}({x.get('toolCallCount')},{len(x.get('replies', []))})")
            print(f"  {t:34} " + " ".join(f"{c:>{max(10, len(n))}}" for c, n in zip(cells, names)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
