# Serein Judge

An agent with image input uses this procedure to grade a Serein launch film
against [BRIEF.md](BRIEF.md). There is no reference video. The brief is the
reference, so grade what the brief says, not your own taste.

## Inputs

Read these parts of BRIEF.md: section 5 (design system), section 6 (scenes)
and section 10 (checkpoints). Do not read `build.js`, `DEFECTS.md`,
`COVERAGE.md` or any message from the builder.

`sheets.sh` makes these images:

| Image | Content |
|---|---|
| `checkpoints_1.png`, `checkpoints_2.png` | Checkpoints C1–C16 at 640×360, 9 per sheet, each labelled with its ID and frame. A red `NO FRAME` panel means that the film is too short. |
| `motion.png` | Six strips, M1–M6. Each strip shows 6 frames across one animation. |
| `overview.png` | The middle frame of each second, 0–25 s. |

Small UI text can be unreadable at this size. When it is, compare the shape,
the position and the colour of the text block, and do not guess the words.

## Part A: checkpoints

Grade each checkpoint on two criteria. The expected content is the checkpoint
row in BRIEF.md section 10 plus the scene text in section 6 at that frame.

| Criterion | 2 | 1 | 0 |
|---|---|---|---|
| **spec**: the frame shows what the brief describes | Every element in the checkpoint row is present, in the described state, in about the described place. | One element is missing or wrong, or the state is visibly different: another count, text still typing, a transition not finished. | The main element is missing, or the frame shows another scene. |
| **finish**: the rendering is clean | Crisp type at the brief's weights, soft glows and gradients, no hard edges, no banding, no clipping, no artefacts. | One visible flaw: a hard glow edge, a wrong weight, banding, a cut-off shape, text overlap. | Several flaws, or one that breaks the frame: garbage pixels, a black or white hole, unreadable headline. |

A `NO FRAME` cell gets 0 on both criteria.

## Part B: motion strips

The six frames of a strip are in time order. Grade each strip on two
criteria. The expected motion is the scene text in BRIEF.md section 6.

| Criterion | 2 | 1 | 0 |
|---|---|---|---|
| **motion**: the path and the easing are right | The change is largest in the first frames and settles (`easeOutExpo`), or it overshoots once and settles (`spring`), as the brief says. No jumps. | The motion exists but is linear, or it jumps between two frames, or it overshoots where the brief has none. | No motion: the element pops in or does not move. |
| **timing**: the animation happens in this window | It starts and settles within the strip as the brief's frames say. | It is visibly early or late, by more than about 3 frames. | It happens outside the strip. |

## Part C: craft

Look at all the images, most of all `overview.png`. Grade each point from 0
to 2: 2 is fully true, 1 is mostly true with a visible lapse, and 0 is not
true.

| ID | Point |
|---|---|
| K1 | The motion is smooth, with no pops, jumps or linear starts. |
| K2 | The type is crisp and correctly weighted, and the hierarchy is clear. |
| K3 | The scene changes land where the brief puts them. |
| K4 | The dark gradients show no banding, and the glows have no hard edges. |
| K5 | It looks like a launch film that a design-led company would ship. |

## Report

Write one JSON object per line, in this order: C1–C16, M1–M6, K1–K5.

```json
{"part": "checkpoint", "id": "C5", "frame": 225, "spec": 2, "finish": 1, "note": "chip text weight too light"}
{"part": "motion", "id": "M3", "motion": 2, "timing": 1, "note": "cards land about 5 frames late"}
{"part": "craft", "id": "K4", "score": 2, "note": ""}
```

Write a short note for every grade under 2. Name what you see, not the cause.

## Score

Each part is scaled to 0..1. The picture score weights them 0.6, 0.2 and 0.2:

```bash
jq -s '
  (map(select(.part == "checkpoint")) | map(.spec + .finish) | add / (length * 4)) as $a |
  (map(select(.part == "motion"))     | map(.motion + .timing) | add / (length * 4)) as $b |
  (map(select(.part == "craft"))      | map(.score) | add / (length * 2)) as $c |
  {checkpoints: $a, motion: $b, craft: $c, picture: (0.6 * $a + 0.2 * $b + 0.2 * $c)}' judge.jsonl
```

The picture passes when all of these are true:

- The picture score is 0.90 or more.
- No checkpoint has `spec` 0.
- No craft point is 0.

Report the part scores too, and every grade under 2 with its note.
