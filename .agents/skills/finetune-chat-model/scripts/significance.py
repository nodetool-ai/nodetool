#!/usr/bin/env python3
"""Is run B's pass count really different from run A's? Paired tests per task.

usage: significance.py [--bootstrap N] [--seed S] A=GLOB B=GLOB
       significance.py --resample NAME=GLOB      (sample 0 against sample 1 of one run)

Runs pair on (task, sample), so two-sample evaluations count as 2 runs per task.
Prints the discordant pairs, the exact two-sided McNemar p-value over them, and
a task-clustered bootstrap of the net difference (B passes minus A passes):
tasks are resampled with all their samples, because two samples of one task are
not independent. --resample measures the noise floor of one model against
itself.

Measured on the v3 validation split (131 tasks): adjacent checkpoints flip about
30-34% of tasks, and GLM's own resample flips 16 of 131. With two samples per
task (262 runs), a net gain of about 18 is needed before the difference is real.
"""
import argparse
import math
import os
import random
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ftlib import by_task_sample, load_lines, parse_spec  # noqa: E402


def mcnemar_exact(b, c):
    """Two-sided exact binomial p-value for b wins against c losses."""
    n = b + c
    if n == 0:
        return 1.0
    k = min(b, c)
    tail = sum(math.comb(n, i) for i in range(k + 1)) / 2 ** n
    return min(1.0, 2 * tail)


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("runs", nargs="*", metavar="NAME=GLOB")
    ap.add_argument("--resample", metavar="NAME=GLOB")
    ap.add_argument("--bootstrap", type=int, default=10000)
    ap.add_argument("--seed", type=int, default=0)
    args = ap.parse_args()

    if args.resample:
        name, patterns = parse_spec(args.resample)
        rows = by_task_sample(load_lines(patterns))
        a_name, b_name = f"{name}[sample 0]", f"{name}[sample 1]"
        a = {(t, 0): r for (t, s), r in rows.items() if s == 0}
        b = {(t, 0): r for (t, s), r in rows.items() if s == 1}
    elif len(args.runs) == 2:
        (a_name, ap_), (b_name, bp_) = map(parse_spec, args.runs)
        a, b = by_task_sample(load_lines(ap_)), by_task_sample(load_lines(bp_))
    else:
        ap.error("give two runs A=GLOB B=GLOB, or --resample NAME=GLOB")

    keys = sorted(set(a) & set(b))
    if not keys:
        sys.exit("the runs share no (task, sample) pair")
    per_task = defaultdict(lambda: [0, 0])  # task -> [B wins, B losses]
    for k in keys:
        pa, pb = bool(a[k]["achieved"]), bool(b[k]["achieved"])
        if pb and not pa:
            per_task[k[0]][0] += 1
        elif pa and not pb:
            per_task[k[0]][1] += 1
    tasks = sorted({k[0] for k in keys})
    wins = sum(v[0] for v in per_task.values())
    losses = sum(v[1] for v in per_task.values())
    flipped = sum(1 for t in tasks if per_task[t][0] or per_task[t][1])

    print(f"{len(keys)} paired runs over {len(tasks)} tasks")
    print(f"  {a_name}: {sum(bool(a[k]['achieved']) for k in keys)} passed")
    print(f"  {b_name}: {sum(bool(b[k]['achieved']) for k in keys)} passed")
    print(f"  {b_name} vs {a_name}: +{wins} -{losses}, net {wins - losses:+d}, "
          f"{flipped} of {len(tasks)} tasks ({flipped / len(tasks):.0%}) differ")
    print(f"  McNemar exact p = {mcnemar_exact(wins, losses):.3f} (pairs treated as independent)")

    rng = random.Random(args.seed)
    nets = [per_task[t][0] - per_task[t][1] for t in tasks]
    draws = sorted(sum(rng.choice(nets) for _ in tasks) for _ in range(args.bootstrap))
    lo, hi = draws[int(0.025 * len(draws))], draws[int(0.975 * len(draws)) - 1]
    at_or_below = sum(d <= 0 for d in draws) / len(draws)
    print(f"  task-clustered bootstrap ({args.bootstrap} draws): net 95% interval [{lo:+d}, {hi:+d}], "
          f"P(net <= 0) = {at_or_below:.3f}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
