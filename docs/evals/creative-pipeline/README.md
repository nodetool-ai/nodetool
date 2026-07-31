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

Stills come from `openai/gpt-image-2`, clips from
`fal-ai/ltx-2-19b/distilled/image-to-video`.

Compressed for the repo: stills to WebP at 720px, clips to h264 at 540px.
Raw output became 1.8 MB, which is the difference between a fixture and a
liability. The originals are not kept.

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

The first pass used `flux/schnell` at $0.003 per megapixel, chosen on cost. It
was the wrong trade: flux mangles hands, and this brief requires them in three
of four shots. A model that cannot draw the thing being commissioned is not
cheap. gpt-image-2 costs materially more per image and renders anatomy that
survives a look.

Swapping it in introduced a *different* brief violation, which is the more
interesting half. flux could not render legible text, so it never breached the
brief's `no logo` rule by accident. gpt-image-2 can, and branded the bottle in
shot 3 with "COLD BREW COFFEE" in raised lettering. Better capability, new
failure mode.

The prompt is why. Sonnet never carried `no logo` into any image prompt — it
lives in the brief, and the model read the brief, but the constraint did not
survive into the generation call. Shot 3 was regenerated with the constraint
appended explicitly.

## Two things these files show that the eval cannot

**The planted defect is conservative.** The suite simulates rendered clips
coming back 1.35× longer than requested. LTX returned 4.84s takes for 3s
requests — **1.61×**. Real video models overshoot harder than the eval assumes.

**Two brief violations the predicates cannot see.** `clip-shot_3` contains
neither hands nor sunrise; the model caught that in its own review and filed
it, while the suite's `mustFeature` check passed because it only asks whether
each element appears *somewhere* in the shot list. And the same shot came back
branded, which `forbiddenAvoided` also passed — that check reads shot action
text and layer names, so it can see the word "logo" in a prompt and never what
the picture actually contains.

Both are the same limit. The predicates grade the plan; only a human or a
vision model grades the artifact. Worth knowing before trusting a green run to
mean the deliverable is on brief.
