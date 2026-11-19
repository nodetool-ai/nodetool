#!/usr/bin/env python3
"""Training loss and learning rate from a Trainer checkpoint's trainer_state.json.

usage: loss-curve.py [--width 72] [--height 14] [--csv FILE] <trainer_state.json>

Prints the mean, first and last loss of each epoch, every step where the
learning rate restarted (a resume rebuilds the cosine schedule), and a text
plot of the loss per step with the epoch boundaries marked. --csv writes
step, epoch, loss and learning rate for another plotting tool.

Train loss shows whether the run converged, not whether it generalizes. Pick a
checkpoint by held-out loss (`train.py loss --with-base`) and by the eval.
"""
import argparse
import json
import math
import sys
from collections import defaultdict


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("state")
    ap.add_argument("--width", type=int, default=72)
    ap.add_argument("--height", type=int, default=14)
    ap.add_argument("--csv")
    args = ap.parse_args()

    state = json.load(open(args.state))
    rows = [x for x in state["log_history"] if "loss" in x]
    if not rows:
        sys.exit(f"{args.state} has no logged loss")
    if args.csv:
        with open(args.csv, "w") as fh:
            fh.write("step,epoch,loss,learning_rate\n")
            for x in rows:
                fh.write(f"{x['step']},{x.get('epoch', '')},{x['loss']},{x.get('learning_rate', '')}\n")

    epochs = defaultdict(list)
    for x in rows:
        epochs[max(1, math.ceil(round(x.get("epoch", 0), 6)))].append(x["loss"])
    print(f"{len(rows)} logged steps, {state.get('global_step')} of {state.get('max_steps')} steps, "
          f"{state.get('num_train_epochs')} epochs planned")
    print("epoch  steps   mean    first   last")
    for e in sorted(epochs):
        v = epochs[e]
        print(f"{e:5}  {len(v):5}  {sum(v) / len(v):.4f}  {v[0]:.4f}  {v[-1]:.4f}")

    lr = [(x["step"], x.get("learning_rate")) for x in rows if x.get("learning_rate") is not None]
    for (s0, a), (s1, b) in zip(lr, lr[1:]):
        if s0 != lr[0][0] and a < 1e-7 <= b and b > 10 * max(a, 1e-12):
            print(f"learning rate restarts at step {s1}: {a:.2e} -> {b:.2e}")

    # One column per bucket of steps, its mean loss as the height.
    n = len(rows)
    cols = min(args.width, n)
    buckets = [rows[i * n // cols:(i + 1) * n // cols] for i in range(cols)]
    means = [sum(x["loss"] for x in b) / len(b) for b in buckets]
    lo, hi = min(means), max(means)
    span = (hi - lo) or 1.0
    level = [round((m - lo) / span * (args.height - 1)) for m in means]
    marks = set()
    for i, b in enumerate(buckets):
        if any(abs(x.get("epoch", 0) - round(x.get("epoch", 0))) < 1e-6 and x.get("epoch", 0) > 0 for x in b):
            marks.add(i)
    print(f"\nloss per step, {lo:.3f} to {hi:.3f}, | marks an epoch end")
    for row in range(args.height - 1, -1, -1):
        label = f"{lo + span * row / (args.height - 1):.3f} "
        line = "".join("*" if level[i] == row else ("|" if i in marks else " ") for i in range(cols))
        print(label + line)
    print(" " * 6 + f"step {rows[0]['step']}" + " " * max(1, cols - 16) + f"step {rows[-1]['step']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
