# Phase 2: export training records

Goal: `sft.jsonl` for training and `val-sft.jsonl` for held-out loss, with every
rejected run accounted for.

## Export

`export --traces` reads one file, so join the lanes first:

```bash
cat data/glm-pass*/glm-l*.jsonl > data/traces.jsonl
$S/ft-data.sh export --traces data/traces.jsonl --out data/sft.jsonl
```

It prints a summary: `traces`, `kept`, `rejected` by reason, and `byTask`. A
run is rejected for one of these reasons:

| Reason | Meaning |
|---|---|
| `not-achieved` | the task's checks failed |
| `no-final-request` | no request was recorded, usually a provider error before the first reply |
| `final-reply-calls-tools` | the run ended on a tool call, at the reply cap or the timeout |
| `empty-final-reply` | the last reply has no text |
| `history-mismatch` | the history sent with the last request differs from the replies the model gave, so no single rendered conversation matches what it saw |
| `duplicate` | another run already produced the same output |
| `validation` | the run belongs to a validation task (by id, `val/` prefix, hash, or identical request) |

## Held-out loss records

Sample the teacher on the validation split (`sample --split val`, as in phase 1)
and export those runs on their own:

```bash
$S/ft-data.sh export --split val --traces data/val-traces.jsonl --out data/val-sft.jsonl
```

These records never reach a training file. `train.py loss` scores each
checkpoint on them in phase 3.

## The frozen validation split

The split is `packages/websocket/scripts/finetune-validation-set.json`: five
generated tasks per family under `val/<family>/<nnn>`, and one in three jobs and
`tool-loop` cases, chosen by a hash of the id. `tests/finetune-validation.test.ts`
fails when the code would generate a different split. Run `ft-data.sh valset`
only after adding a family on purpose, and note which models were trained
before the change.

## Check before moving on

- Every reject reason has an explanation. Many `history-mismatch` rejects point
  at compaction or a provider rewriting history. Many `final-reply-calls-tools`
  rejects point at runs hitting the cap.
- The kept count per family (`byTask`) meets the plan's targets. v3 trained on
  391 GLM runs.
- `python scripts/finetune/train.py check --data data/sft.jsonl` renders every
  record. It needs only the tokenizer and runs on the pod in phase 3 as well. It
  reports the sequence lengths, and records longer than `--max-seq` are dropped
  from training.
