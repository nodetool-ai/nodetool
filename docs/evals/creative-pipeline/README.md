# creative-pipeline — a live run's output

What one run of the `creative-pipeline` eval produced with `--live`, kept here
so the suite's output can be looked at without paying for a run.

The suite is headless by default: every generate and render is a status flip
against in-memory state, which is what makes it cost the agent loop and nothing
else. `--live` additionally routes the same tool calls to fal, so these files
are what the model directed, not illustrations of it.

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

Compressed for the repo: stills to WebP at 720px, clips to h264 at 540px.
15 MB of raw output became 1.3 MB, which is the difference between a fixture
and a liability. The originals are not kept.

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

## Two things these files show that the eval cannot

**The planted defect is conservative.** The suite simulates rendered clips
coming back 1.35× longer than requested. LTX returned 4.84s takes for 3s
requests — **1.61×**. Real video models overshoot harder than the eval assumes.

**A per-shot brief violation the predicates miss.** `clip-shot_3` (condensation
on a bottle) contains neither hands nor sunrise. The model caught this in its
own review and filed it; the suite's `mustFeature` check only asks that each
element appears *somewhere* in the shot list, so it passed. The model's
judgement was finer than the check's.
