---
name: finetune-chat-model
description: "Fine-tune a local model for NodeTool chat end to end: sample graded teacher runs, export SFT records, train a QLoRA adapter on a Runpod GPU, quantize to GGUF, evaluate on llama.cpp against the frozen validation split, and analyse the traces. Use when running, repeating or changing that loop. For the training code itself (render, loss mask), read scripts/finetune/README.md."
---

# Fine-tune a chat model

The result of one pass through the loop is a GGUF and the evidence that it beats
the current checkpoint on the frozen validation split by more than the noise:
the `compare.py` and `significance.py` output for two samples per task.

The code lives in the repository: the sampler and exporter in
`packages/websocket/scripts/finetune-data.ts`, the tasks and graders in
`packages/websocket/src/finetune/`, and training in `scripts/finetune/train.py`.
Read [scripts/finetune/README.md](../../../scripts/finetune/README.md) for the
render, the loss mask and the validation split. This skill adds the operations
around that code, in `scripts/`. Every script prints its usage with `--help`.

## The loop

| Phase | Reference | Scripts | Move on when |
|---|---|---|---|
| 1. Sample teacher runs | [sample.md](references/sample.md) | `dump-tool-manifest.sh`, `make-lanes.py`, `sample-lanes.sh`, `ft-data.sh` | every lane exited 0, pass rate and cost per family read |
| 2. Export | [export.md](references/export.md) | `ft-data.sh export` | kept and rejected counts explained, validation records exported apart |
| 3. Train on Runpod | [train-runpod.md](references/train-runpod.md) | `make-bundle.sh`, `pod-*.sh`, `quantize.sh`, `loss-curve.py` | every GGUF and checkpoint fetched and verified, pod stopped |
| 4. Evaluate | [evaluate.md](references/evaluate.md) | `serve-local.sh`, `eval-model.sh`, `compare.py`, `significance.py` | two samples per task, paired test read |
| 5. Analyse traces | [analyse.md](references/analyse.md) | `traces.py` | the next change to data or harness is named, with numbers |
| 6. Try it by hand | [try-in-nodetool.md](references/try-in-nodetool.md) | `try-in-nodetool.sh` | a person has used the model in the product |

Load only the reference for the phase at hand. Phase 5 usually feeds the next
pass at phase 1, or a harness fix. The plan for the next round is
`docs/plans/finetune-v4/plan.md` on the `docs/finetune-v4-plan` branch.

Run the commands in the references from the repository root, in bash, after:

```bash
S=.agents/skills/finetune-chat-model/scripts
export FT_HOME=${FT_HOME:-$HOME/.cache/nodetool-finetune}
```

State lives outside the repository. `FT_HOME` holds `manifest.json`, `models/`,
`runs/`, the bundles, a llama.cpp build and `tmp/`. Keep traces and eval results
in an ignored directory such as `nodetool-debug/finetune/`.

## Hard rules

1. **Spend only with approval.** Creating a pod (`pod-create.sh`) and sampling a
   paid teacher cost money. State the expected cost first and wait for the
   operator. A GLM-5.3-flash run costs about $0.016 and takes about 76 s. Pass
   `--budget` on every paid `sample`.
2. **No provider key in a sampled run's environment.** The run's tools are real
   server tools: a sampled model once found an OpenRouter key and started paid
   video generations. The teacher's key reaches the sampler only as a file
   path in `FINETUNE_OPENROUTER_KEY_FILE`. The operator supplies the path. Never
   hard-code it, print the key, or copy it anywhere. `ft-data.sh` unsets the
   provider keys, and the sampler refuses to start while one is set.
3. **Copy and verify before you stop a pod.** Treat a stopped pod's files as
   lost. A pod's own volume lives on one machine, and a restart hangs at
   `awaiting_container` while that machine's GPU is rented out. Train on a
   network volume. Stop only through `pod-fetch.sh --stop`, which stops after
   every file's size and sha256 match on both sides and none is empty. If the
   operator asks to stop during a copy, say how long the copy needs and finish
   it first. Recover a stuck pod with `pod-resume.sh`.
4. **The validation split stays frozen.** Never train on a validation task.
   `export` rejects them, and `sample --split val` refuses a drifted split.
   Rewrite the manifest with `ft-data.sh valset` only after adding a family on
   purpose. A model trained before that has seen the new tasks, so its score on
   them does not count.
5. **Keep measurements comparable.** Evaluate with `serve-local.sh` as it is
   (its sampling flags), Q4_K_M, one tool manifest, and the same harness commit
   for every model you compare. Check the speed first: below 20 tok/s the GPU is
   shared and timeouts change the result.
6. **Decide on paired statistics.** About 30-34% of tasks flip between
   checkpoints, and GLM flips 16 of 131 against itself. Evaluate two samples per
   task (262 runs) and read `significance.py`. A net gain below about 18 is noise.
7. **Run long jobs detached and check their exit status.** Use
   `run-detached.sh`: a plain `nohup` job died with the session. `pgrep -f` can
   match the shell that runs it, so check a job with `systemctl --user is-active`
   or its pid file. zsh does not split an unquoted variable into words, so run
   these scripts with bash and pass lists as one comma-separated argument.
8. **Use the repository's environment.** Node from `.nvmrc` (`ft-data.sh`
   checks it), `DISPLAY` unset, and `TMPDIR` on disk: `/tmp` is often a small
   tmpfs, nvcc fills it, and a heredoc into a full `/tmp` writes nothing without
   an error. Run `npm run build:packages` after pulling, since the sampler
   imports the built packages.
9. **Train only on output whose licence allows it.** GLM, Qwen, Gemma and
   gpt-oss allow it. Never use the `claude_agent_sdk` provider as a teacher (see
   the README).
