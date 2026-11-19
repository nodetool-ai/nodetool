#!/usr/bin/env python3
"""Split task ids into lane files for parallel `ft-data.sh sample` runs.

usage: make-lanes.py --out-dir DIR (--valset FILE | --tasks-file FILE | --ids A,B,..)
                     [--lanes 2] [--match REGEX] [--done GLOB ...] [--model NAME]
                     [--samples 1]

Writes DIR/lane0.txt, DIR/lane1.txt, ... each a comma-separated id list for
`--tasks`, dealt round-robin so every lane gets a mix of families. Prints the
counts.

--valset      the frozen validation manifest (finetune-validation-set.json)
--tasks-file  the output of `ft-data.sh tasks` (id first on each line), or ids
              one per line or comma-separated
--match       keep only ids matching REGEX, such as '^gen/(sketch|svg)-'
--done        JSONL run files: a task is done once it has --samples runs in them
              (of --model, when given), and done tasks are left out. This is how
              a stopped evaluation resumes.
"""
import argparse
import glob
import json
import os
import re
import sys
from collections import Counter


def read_ids(args):
    if args.valset:
        return [e["id"] for e in json.load(open(args.valset))]
    if args.ids:
        return [i for i in args.ids.split(",") if i]
    ids = []
    for line in open(args.tasks_file):
        line = line.strip()
        if not line or line.startswith(("{", "[")):
            continue
        first = line.split("\t", 1)[0]
        ids += [i.strip() for i in first.split(",") if i.strip()]
    return ids


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    src = ap.add_mutually_exclusive_group(required=True)
    src.add_argument("--valset")
    src.add_argument("--tasks-file")
    src.add_argument("--ids")
    ap.add_argument("--out-dir", required=True)
    ap.add_argument("--lanes", type=int, default=2)
    ap.add_argument("--match")
    ap.add_argument("--done", nargs="*", default=[])
    ap.add_argument("--model")
    ap.add_argument("--samples", type=int, default=1)
    args = ap.parse_args()

    ids = list(dict.fromkeys(read_ids(args)))
    if args.match:
        ids = [i for i in ids if re.search(args.match, i)]
    runs = Counter()
    seen = set()
    for path in sorted({f for g in args.done for f in glob.glob(g)}):
        for line in open(path):
            if not line.strip():
                continue
            r = json.loads(line)
            if args.model and r.get("model") != args.model:
                continue
            key = (r["taskId"], r.get("sample", 0))
            if key not in seen:
                seen.add(key)
                runs[r["taskId"]] += 1
    left = [i for i in ids if runs[i] < args.samples]
    os.makedirs(args.out_dir, exist_ok=True)
    for k in range(args.lanes):
        with open(os.path.join(args.out_dir, f"lane{k}.txt"), "w") as fh:
            fh.write(",".join(left[k::args.lanes]))
    print(f"{len(ids)} tasks, {len(ids) - len(left)} done, {len(left)} left in {args.lanes} lanes "
          f"under {args.out_dir}")
    return 0 if ids else 1


if __name__ == "__main__":
    sys.exit(main())
