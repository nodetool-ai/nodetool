# Phase 5: analyse traces

Goal: name what the student does wrong that the teacher does not, with
numbers, so the next round changes the data or the harness for a reason.

Every eval line holds the run's last request (`finalRequest`), with each
action's code and each tool result, plus the replies and the graded
`outcomes`. `traces.py` reads the same `NAME=GLOB` specs as `compare.py`. A tool
call counts as an error when its result is an error by `ftlib.error_kind`. Rates
under another definition differ: epoch 6 reads 0.37 to 0.45 across the
definitions tried. Compare rates only under this one.

```bash
D=nodetool-debug/finetune
R=("e6=$D/eval-v3e6/*.jsonl" "glm=$D/teacher-val/*.jsonl")
python3 -I $S/traces.py rates "${R[@]}"
python3 -I $S/traces.py kinds --sft train=data/sft.jsonl --top 15 "${R[@]}"
python3 -I $S/traces.py task-errors val/svg-edit/000 "${R[@]}"
python3 -I $S/traces.py dump "$D/eval-v3e6/*.jsonl" val/svg-edit/000
python3 -I $S/traces.py grep 'import\s*\(' "${R[@]}"
```

- `rates`: the error rate by call index (calls 1-5, 6-10, 11-20, 21-50), the
  overall rate, how often the call after an error succeeds, runs with an error
  streak of three or more, and passes by run length in replies.
- `kinds`: error kinds per 100 calls, one column per run, and with `--sft` the
  training data's own errors. `--top` lists the most common uncategorised
  messages, which is where harness problems show up, such as a tool "not open in
  this job".
- `task-errors`: one task across runs, with the failed checks and the failing
  tool results.
- `dump`: one run message by message.
- `grep`: runs per family whose code (or, with `--in results`, tool results)
  match a pattern.

## v3 reference values

| Run | Passed | Error rate | Next call ok after an error | Calls 1-5 | Calls 21-50 |
|---|---|---|---|---|---|
| Base Qwen3.5-9B | 61 | 0.35 | 0.49 | 0.35 | 0.42 |
| v3 epoch 3 | 84 | 0.41 | 0.44 | 0.35 | 0.49 |
| v3 epoch 6 | 84 | 0.42 | 0.40 | 0.34 | 0.52 |
| GLM teacher | 115 | 0.26 | 0.59 | 0.20 | 0.34 |

The training set's own error share was 0.25. Per 100 calls, epoch 6 made 7.4
wrong-module imports against GLM's 1.8, and 4.8 undefined names against 1.4.
Runs with 21 or more replies passed 11 of 31 for epoch 6 and 12 of 16 for GLM.

## Reading a failure

For each failing task, decide which of these it is, and count them:

- the harness or the grader alone (the teacher fails it too, or a tool is
  missing from the job),
- a model mistake that the harness made likely (an unclear error message, a
  silently ignored argument),
- a plain model mistake: claiming success that its own readback contradicts,
  guessing an argument shape instead of looking up the signature, repeating a
  failing call, re-running a partly applied action, or importing from the wrong
  module.

The first two are harness work, with a reproduction test first. Only the third
is training data work. The v3 analysis of the 47 epoch-6 failures found about
6, 16 and 25. The plan in `docs/plans/finetune-v4/plan.md` turns those into
work items.

## Check before moving on

- Each proposed change cites a count from these scripts, under one error
  definition.
- Harness and grader fixes are separated from data changes.
