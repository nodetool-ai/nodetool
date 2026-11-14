# creative-pipeline — a live run's output

What one run of the `creative-pipeline` eval produced with `--live`, kept here
so the suite's output can be looked at without paying for a run.

The suite is headless by default: every generate and render is a status flip
against in-memory state, so a run costs only the agent loop. `--live` also
routes the same tool calls to fal.

## The commission

The brief (`LANTERN_BRIEF`) asked for a vertical social spot for a cold brew:
**9:16, under 12 seconds, must feature hands and sunrise, no logo.**

claude_agent_sdk/sonnet read the brief, proposed three concepts, committed to
one, built a style frame, wrote and rendered four shots, assembled the cut,
measured it, trimmed it, and signed it off — 162 tool calls, delivered at
**11.80s**.

## Files

| File | Phase |
|---|---|
| `style-frame.webp` | Sketch — the look the shots follow |
| `keyframe-shot_{1..4}.webp` | Storyboard — one still per shot |
| `clip-shot_{1..4}.mp4` | Storyboard — each still animated |

Stills come from `openai/gpt-image-2`, clips from
`fal-ai/ltx-2-19b/distilled/image-to-video`.

Compressed for the repo: stills to WebP at 720px, clips to h264 at 540px.
Raw output was 1.8 MB. The originals are not kept.

## Reproducing

```bash
FAL_API_KEY=$FAL_KEY IS_SANDBOX=1 npx tsx \
  packages/agents/scripts/dump-creative-run.ts full-pipeline claude_agent_sdk sonnet 220 --live
```

Output lands in `nodetool-debug/` (gitignored) with a full transcript and
per-phase state snapshots alongside the media.

Roughly **$2.60** for the agent loop and **$0.17** for the media —
`flux/schnell` at $0.003/megapixel and `ltx-2-19b/distilled/image-to-video` at
$0.0008. The model driving the pipeline costs an order of magnitude more than
the pipeline's output.

## Why not a cheaper image model

The first pass used `flux/schnell` at $0.003 per megapixel. It mangles hands, and this brief requires them in three of four shots, so the pass used `openai/gpt-image-2`, which costs more per image and renders usable anatomy.

The swap introduced a different brief violation. flux cannot render legible text, so it never breached the `no logo` rule. gpt-image-2 can, and it branded the bottle in shot 3 with "COLD BREW COFFEE" in raised lettering. Sonnet never carried `no logo` from the brief into any image prompt. Shot 3 was regenerated with the constraint appended explicitly.

## What the files show that the eval cannot

**The planted defect is conservative.** The suite simulates rendered clips coming back 1.35× longer than requested. LTX returned 4.84s takes for 3s requests, which is **1.61×**.

**Two brief violations the predicates cannot see.** `clip-shot_3` contains neither hands nor sunrise. The model caught that in its own review, while the suite's `mustFeature` check passed because it only asks whether each element appears somewhere in the shot list. The same shot came back branded, which `forbiddenAvoided` also passed. That check reads shot action text and layer names, so it sees the word "logo" in a prompt and never what the picture contains.

The predicates grade the plan. Only a human or a vision model grades the artifact.
