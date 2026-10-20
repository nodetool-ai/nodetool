---
name: ad-creative-testing
description: "Design and build matched ad variants that test one storytelling choice at a time (question-first vs direct, a reversal vs the expected outcome, one loop vs several, resolved vs open ending, product facts vs a person's goal), write the test plan, and read the results without mistaking retention for success. Use when someone wants A/B or split-test versions of an ad or marketing video, asks which hook or structure works better, or brings back retention curves, view-through rates or ad results to interpret."
---

# Testing ad structure with matched variants

Creator frameworks for hooks and story loops have not been tested against
alternatives in controlled comparisons. The way to know whether a structure
works for this product and this audience is to run two versions that differ
in that structure and nothing else. This skill builds those versions in
NodeTool, writes the plan the user runs on their ad platform, and reads what
comes back.

NodeTool makes and renders the variants. It does not buy media or read ad
accounts, so the user runs the test and brings the numbers back. Load
`ad-story-loops` for the loop map the variants are built from, and the job
skill that made the ad (`motion-ad`, `commercial-beat-sheet`,
`launch-commercial`, `ugc-video`) for how its board and cut are built.

## One variable per test

A pair of variants answers one question. Hold everything else fixed:

- runtime within 0.5s, the same aspect ratio and the same opening frame
  unless the opening is the variable
- the same product assets, cast, music bed, grade and type system
- the same claims, the same CTA wording and the same end card
- the same placement, audience, budget and dates on the platform

Change the hook and the ending together and a win cannot be attributed to
either. A third arm is fine when the user has the budget, but each arm still
differs from the control in one way.

## Variables worth testing

| Test | Control | Variant | Primary outcome |
|---|---|---|---|
| Curiosity gap | States the result, then explains | Names the question, explains, then shows the result | Retention through the first payoff |
| Earned surprise | The expected outcome | A coherent reversal set up earlier | Post-view satisfaction and recall |
| Loop count | One central question | Several connected questions | Completion and comprehension |
| Ending | Resolved | Open, pointing at the next episode | Stated intent to watch the next one, and actual continuation |
| Person vs facts | Product facts alone | The same facts through a person's goal | Brand recall and qualified engagement |
| Hook archetype | One archetype | Another, same body | 2s and 6s views, then retention |

Write each test as a hypothesis before building: "Opening on the question
instead of the result keeps more viewers to the first payoff at 8s, without
lowering click-through."

## Build the variants

Build the control first and finish it. Every variant is a copy with one
change, never a second ad made from scratch.

1. **Snapshot the control.** `create_timeline_version {timeline_id}` on the
   finished cut, so the control can always be restored.
2. **Copy the cut.** `get_timeline {timeline_id}`, then `create_timeline`
   with the same `fps`, `width` and `height` and a versioned name
   (`<brand>-<topic>-<variable>-B`), then `set_timeline_document` on the new
   id with the document `get_timeline` returned. The returned `timeline`
   object is accepted as is, but its `name` renames the target sequence, so
   set `name` to the variant's name before sending it.
3. **Make the one change** on the copy with `edit_timeline`
   (`timeline-edit-ops` owns the op shapes). A reorder is `move_clip`. A
   different headline is the text clip's content. A cut beat is
   `delete_clip`, then close the gap so the runtime stays matched.
4. **A variant that needs new footage** gets its shot on the same board:
   `edit_storyboard` `duplicate_shot` on the shot it replaces, `update_shot`
   with the changed `action` or `motion` and `notes: "variant B only"`, then
   `render_storyboard_clips {targets: [<slug>]}` for that shot alone, and place
   the clip in the variant cut with `add_media_clip`. Assemble the control
   before adding variant shots: `assemble_storyboard_timeline` lays every
   rendered shot into the sequence, so re-running it afterwards would put the
   variant shot into the control.
5. **Prove the match.** `compare_timeline_frames {a: <control id>, b:
   <variant id>}` sweeps both cuts. Frames should differ only where the
   variable lives. A difference anywhere else is a second variable: fix it
   before rendering.
6. **Render each arm** with `render_timeline` and name the assets after the
   timelines. Never overwrite a delivered control.

New renders cost money. Before rendering footage for a variant, report how
many clips the variants add and on which model, and get the user's go-ahead.
A variant that only reorders, retimes or rewords existing material renders
nothing new except the final `render_timeline`.

## Check comprehension before anyone pays for media

A variant that holds attention but blurs the message fails the test it was
built for. Before handing the arms over, ask a model that reads video what
each one says: `understand_video` on each rendered file with "What is being
advertised, what does it claim, and what is the viewer asked to do?". It
takes a `provider` and `model`. A Gemini model reads the whole clip with its
audio, and other vision models see sampled stills only. If an
arm's answer misses the central claim or the CTA, fix that arm first. This
is a check on the cut, not a substitute for audience data.

## The test plan

Deliver the plan with the files. The user runs it on their platform.

```text
TEST:          <name>
HYPOTHESIS:    <one sentence: change, expected effect, guard metric>
VARIABLE:      <the one difference between arms>
ARMS:          A = <asset name> (control), B = <asset name>
HELD FIXED:    runtime, assets, music, CTA, audience, placement, budget, dates
PRIMARY:       <the metric the hypothesis names>
GUARDRAILS:    <comprehension or click-through, and conversion if tracked>
SPLIT:         the platform's own split-test or experiment tool, so exposure
               is randomized. Not two ads posted on different days
STOP RULE:     <equal spend per arm, and the platform's confidence reading,
               before calling a winner>
```

## Reading the results

Retention is a diagnostic, not the definition of success.

- **A spike** in a retention curve can be rewatching or confusion. Check what
  is on screen at that second: a dense frame people pause on, or a payoff
  worth seeing again.
- **A dip** can be people skipping ahead rather than leaving. Compare it with
  the drop in viewers who reach the end.
- **New and returning viewers** behave differently. YouTube reports them
  apart. Compare like with like.
- **Platform view metrics are not interchangeable.** TikTok reports 2-second,
  6-second and 15-second views, and the definitions vary by report. Compare
  the same metric across arms, from the same report.
- **Completion without comprehension or conversion** means the ad entertained
  the wrong audience. Weigh the primary metric against the guardrails before
  naming a winner.
- **A cliffhanger arm** that raises intent to watch the next episode has not
  shown more enjoyment or more sales. Check what viewers did next, not only
  what they said.

When the arms ran at different times, to different audiences, or with
unequal spend, say the result is confounded instead of naming a winner.

## Keep what was learned

A result is only useful if the next brief starts from it. Save the outcome
with `memory_save`: product, audience, placement, the variable, both arms'
primary and guardrail numbers, and the decision. Write the next test from
there.
