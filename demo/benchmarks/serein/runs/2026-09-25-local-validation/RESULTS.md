# Serein run 2026-09-25 local validation

- Brief and renderer checkout: `273cbc7b76` with uncommitted Serein and GPU changes.
- Builder: existing `build.js`. Judges: GPT-6 Sol ×3.
- Timeline: `1336a629714e`. Export: [local MP4](../../../../out/serein-launch-validate-20260925.mp4); no asset upload.

## Result: FAIL

The [automatic score](../../../../out/serein-validation-score-20260925.txt) passed. The median picture score is below the 0.90 threshold in [JUDGE.md](../../JUDGE.md). No judge assigned a checkpoint `spec` 0 or a craft 0.

| Check | Result |
|---|---:|
| G1 / G2 | pass / pass |
| Judge A picture (checkpoints, motion, craft) | 0.8954 (0.9063, 0.9583, 0.8000) |
| Judge B picture | 0.9196 (0.9688, 0.7917, 0.9000) |
| Judge C picture | 0.8725 (0.9375, 0.7500, 0.8000) |
| Median picture | 0.8954 |

Judge C was required because A and B fell on opposite sides of 0.90. The [render log](../../../../out/serein-validation-20260925.log) records 780 frames in 88.8 seconds, no skipped clips, and no GPU error. The MP4 has one H.264 video stream, 26 seconds long, with no audio stream.

## Lost points by visible cause

The counts below are raw rubric points lost across all three judges. They are not percentage-point deductions from the weighted picture score. No current loss has been reproduced as a renderer defect, so these remain authoring or craft findings until investigated. Individual notes and every grade are in [judge A](../../../../out/serein-validation-sheets-20260925/judge-a.jsonl), [judge B](../../../../out/serein-validation-sheets-20260925/judge-b.jsonl), and [judge C](../../../../out/serein-validation-sheets-20260925/judge-c.jsonl).

| Visible cause | Kind | Samples | Raw points lost |
|---|---|---|---:|
| RGB split is hard to discern | agent | C2 | 3 |
| Board depth and card overlap | agent | C7, C8 | 3 |
| Warm pill and toast arrive before the checkpoint state | agent | C10, C11 | 4 |
| Particles obscure the zero and subline | agent | C12 | 2 |
| Counter entrance reads as a pop | agent | M1 | 5 |
| Sort cards show little flight or spring settling | agent | M3 | 3 |
| Plane path or toast timing lacks the expected progression | agent | M4 | 2 |
| Zero and end-card entrances show little progression | agent | M5, M6 | 2 |
| Motion smoothness and overall polish | agent | K1, K5 | 5 |

## Coverage

[COVERAGE.md](../../COVERAGE.md) records 10 checkpoints as worked and 6 as workarounds, with none failed. The local full export verifies the frame-642 cut and C10 caret. The intermittent long-lived server GPU failure was not tested by this fresh-process render.
