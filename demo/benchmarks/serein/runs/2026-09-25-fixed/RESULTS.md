# Serein run 2026-09-25 fixed

- Brief and renderer checkout: `273cbc7b76` with uncommitted Serein and GPU changes.
- Builder: `build.js`. Judges: GPT-6 Sol ×2.
- Timeline: `1336a629714e`. Export: [local MP4](../../../../out/serein-launch-validate-20260925-v4.mp4); no asset upload.
- Document SHA-256: `4faf873ea04f375ae633ea36969d472a8b708417db90194eadc6363049403f0f`.

## Result: PASS

The [automatic score](../../../../out/serein-validation-score-20260925-v4.txt) passes G1 and G2. All five required cuts land on the exact frames. The [render log](../../../../out/serein-validation-20260925-v4.log) records 780 frames in 89.267 seconds, no skipped clips, and no GPU errors or startup stall. The 26-second MP4 has one H.264 video stream and no audio stream.

| Check | Result |
|---|---:|
| G1 / G2 | pass / pass |
| Judge A picture (checkpoints, motion, craft) | 0.9906 (0.9844, 1.0000, 1.0000) |
| Judge B picture | 1.0000 (1.0000, 1.0000, 1.0000) |
| Mean picture | 0.9953 |

Both judges exceed 0.90. Neither gave a checkpoint `spec` 0 or craft 0. The scores differ by less than 0.03 and fall on the same side of 0.90, so the rubric does not require a third judge. See [judge A](../../../../out/serein-validation-sheets-20260925-v4/judge-a.jsonl), [judge B](../../../../out/serein-validation-sheets-20260925-v4/judge-b.jsonl), and the [checkpoint sheets](../../../../out/serein-validation-sheets-20260925-v4/checkpoints_1.png).

## Lost points by cause

| Visible cause | Kind | Sample | Raw points lost | Defect |
|---|---|---|---:|---|
| One judge read the toast as already fully visible at frame 530 | agent | C11 spec | 1 | – |

The other judge scored C11 fully. No current lost point has been reproduced as a renderer defect.

## Coverage

[COVERAGE.md](../../COVERAGE.md) records 10 checkpoints as worked and 6 as workarounds, with none failed. This fresh-process export verifies the frame-642 cut, exported C10 caret, RGB adjustment, and revised motion. It does not test the intermittent long-lived server failure.
