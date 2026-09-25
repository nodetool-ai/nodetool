# Sizzle Judge

An agent with image input uses this procedure to score how well a candidate
video matches the reference sizzle. `sheets.sh` makes the images, and the
agent grades each cell with the rubric below. The agent then reports one
JSON line for each cell.

## Make the sheets

```bash
demo/benchmarks/sizzle/sheets.sh candidate.mp4 demo/out/sizzle-reference.mp4 out/judge 2
```

The last argument is the number of samples each second. The default is 2,
which gives 65 samples on 8 sheets for the 977-frame reference. Each sample
is taken at the middle of its interval, so no sample sits on a cut.

Each sheet has 9 cells in a 3×3 grid. A cell has three parts:

1. A title bar with the sample number, the frame, the time, and the scene
   from the reference timing. For example: `#23 frame 337 t 11.23 s Montage 2-7 Board.`
2. The reference frame, labelled `REF`.
3. The candidate frame at the same frame number, labelled `CAND`. A red
   `NO FRAME` panel means that the candidate is shorter than the reference.

## Grade each cell

Compare `CAND` with `REF` only. Do not give points for a candidate that looks
better than the reference. Grade four criteria from 0 to 2.

| Criterion | 2 | 1 | 0 |
|---|---|---|---|
| **Content**: the same elements are present | All elements match: text strings, logo, the product surface and its state, take clips, counter, label line. | One secondary element is missing or different, for example the counter, the label line, a caret, or a different take clip in the background. | A primary element is missing or wrong: another headline, another product surface, no logo, no window. |
| **Layout**: the elements are in the same place | Positions, sizes, rotation and perspective match within about 2% of the frame width. | The composition is the same, but something is visibly off: a size or position error above about 2%, a flat window where the reference has a 3D tilt, or text on another line. | The composition is different: elements in other regions, another scale, another arrangement. |
| **Moment**: the frame shows the same point in time | The same shot and the same animation phase: enter or settled, the same typed length, the same flash or fade state, the same progress in the product UI. | The same shot, but another phase: still entering, already settled, more or less text typed, other progress in the UI. | Another shot or scene. |
| **Look**: the rendering style matches | Colours, gradients, glow, blur, backdrop, type weight and shadows match. | A visible difference in style, for example a hard glow edge, another font weight, a missing gradient, a brighter backdrop. | Another palette or style. |

A `NO FRAME` cell gets 0 for every criterion.

Grade what you see in the cell. Small UI text can be illegible at this size.
In that case, compare the shape and position of the text blocks, not the words.

## Report

Write one JSON object per line for each sample, in sample order:

```json
{"sample": 23, "frame": 337, "content": 2, "layout": 1, "moment": 2, "look": 2, "note": "window is flat, reference tilts left"}
```

Keep `note` short. Write a note for every criterion under 2.

The cell score is the sum of the four criteria divided by 8. The video score
is the mean of all cell scores. Compute it from the JSON lines:

```bash
jq -s 'map((.content + .layout + .moment + .look) / 8) | add / length' judge.jsonl
```

A candidate passes the picture check when the video score is 0.95 or more.
Also report the mean of each criterion, because it shows which kind of error
costs the most:

```bash
jq -s '{content: (map(.content) | add / length / 2), layout: (map(.layout) | add / length / 2),
  moment: (map(.moment) | add / length / 2), look: (map(.look) | add / length / 2)}' judge.jsonl
```
