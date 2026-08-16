# Script ↔ Storyboard Link — PRD

> Status: Proposed · Owner: matti
>
> Companion documents: [design.md](design.md) (technical design),
> [tasks.md](tasks.md) (implementation checklist).

## Problem

NodeTool has two pre-production documents that both feed the timeline, and no
connection between them:

- The **script** owns words and voice: lines, cast, takes, word timings
  (`packages/protocol/src/api-schemas/scripts.ts`).
- The **storyboard** owns visuals and motion: shots, stills, clips, style
  (`packages/protocol/src/api-schemas/storyboards.ts`).

A shot already carries `dialogue` and `narration` text fields
(`packages/protocol/src/creative.ts`), but that text is dead weight: storyboard
assembly turns the whole screenplay's narration into a single **draft**
text-to-audio clip with no cast, no takes, and no word timings
(`packages/timeline/src/storyboard.ts`), while the script editor has the full
voicing machinery and no way to receive that text. A user who wants both
picture and voice must maintain the words twice and assemble two timelines.

The entry order also varies by video. Sometimes the script exists first (a
narrated explainer, an ad with approved copy); sometimes the visuals come
first (a director brief broken into shots); sometimes neither (a one-line
prompt in Studio). Today only one order works per document type.

## Goals

1. One video project can have a script and a storyboard that agree on the
   words, with each document edited in its own editor.
2. Either document can exist first. The other is derived from it in one
   action, with the link established automatically.
3. One "Assemble" produces one timeline: shot clips on the video track,
   voiced takes on the voiceover track, aligned shot by shot.
4. Voiced audio drives shot timing. A shot linked to voiced lines gets its
   duration from the takes, not from a guessed `duration_seconds`.
5. Drift is visible. When line text changes after a shot was rendered, or a
   linked shot is deleted, the affected document shows it.
6. The whole flow works headlessly through agent tools, so "here is my
   script, make it a video" is one chat conversation.

## Non-goals

- **No merged document.** Script and storyboard stay separate resources with
  separate editors. The same reasoning that kept the script separate from the
  in-timeline transcript applies (see
  [script-editor-concept.md](../script-editor-concept.md) § Relation to the
  in-timeline transcript): one document per source of truth.
- **No automatic three-way merge.** Structural drift after assembly (lines or
  shots added, removed, reordered) prompts a re-derive or re-assemble; it is
  not silently merged.
- **No change to unlinked behavior.** A storyboard without a linked script
  assembles exactly as today, narration draft clip included. A script without
  a board keeps "Send to timeline" unchanged.
- **No lip-sync or in-shot audio placement.** Alignment is shot-granular: a
  take starts when its shot starts.

## Users and entry orders

| Entry order | User | First action |
| --- | --- | --- |
| Script first | Writer with approved copy; narrated explainers, ads | "Create storyboard" in the script editor |
| Storyboard first | Visual thinker; director-agent output with dialogue | "Extract script" in the storyboard editor |
| Prompt first | Studio beginner | Studio prompt flow creates both, already linked |

## User stories

1. **Script-first.** I wrote and voiced a 20-line script. I press *Create
   storyboard*. A board opens with one shot per beat, each shot linked to its
   lines, shot durations matching my voiced takes. I render stills and clips,
   press *Assemble*, and get one timeline where every take starts with its
   shot.
2. **Storyboard-first.** The director agent gave me a 12-shot board with
   dialogue on each shot. I press *Extract script*. A script opens with one
   line per shot dialogue, speakers seeded from the board's character
   entities (their `voice_id` becomes the cast voice). I voice all lines,
   return to the board — shot durations now follow the takes — and assemble.
3. **Prompt-first.** In Studio I type an idea. The director drafts the
   screenplay and the script together, linked. I land on a project card that
   shows board, script, and (later) timeline as one project.
4. **Drift.** I rewrite line 7 after its shot was rendered. The shot shows a
   "dialogue drifted" badge; one click re-projects the text (and offers a
   re-render). I delete a shot; its lines show an "unlinked" badge.
5. **Headless.** In chat: "Turn script X into a video." The agent derives a
   board, renders stills and clips, voices the remaining lines, assembles one
   timeline, and validates it — no editor open.

## Requirements

### Functional

- **R1 — Link.** A storyboard can reference one script. Each shot can
  reference an ordered list of that script's line ids. A line belongs to at
  most one shot; the link is validated.
- **R2 — Derive board from script.** From the script editor and from chat:
  create a linked storyboard whose shots cover the script's lines in order.
  Uses the director agent for shot content; linkage assignment is
  deterministic.
- **R3 — Extract script from board.** From the storyboard editor and from
  chat: create a linked script from shot `dialogue`/`narration` text, cast
  seeded from character entities (`voice_id`). Deterministic; no model call.
- **R4 — Audio-led timing.** A shot linked to lines with voiced current takes
  derives its duration from take durations plus authored pauses. A per-shot
  manual override wins and is marked as such.
- **R5 — Joint assemble.** Assembling a linked board produces one timeline:
  shots on the video track, one clip per voiced line on the voiceover track
  starting at its shot's start, music as today. The single narration draft
  clip is not created when a script link exists. Clips carry both linkage key
  families, so both existing back-sync paths keep working.
- **R6 — Drift visibility.** Line-text drift against the shot's projected
  snapshot, orphaned lines, and dangling line references are derived (never
  stored as status) and shown in both editors.
- **R7 — Navigation.** "Open script" / "Open storyboard" from either editor.
  Studio home groups linked documents into one project card.
- **R8 — Agent surface.** Headless tools for derive, extract, and linked
  assemble; `ui_*` equivalents in both editors; the creative-pipeline eval
  covers script→board→timeline end to end.

### Non-functional

- Derive/extract/assemble mappings are pure functions in shared packages,
  used identically by the editors, the server tools, and the evals — the
  established pattern (`buildStoryboardTimeline`, `buildScriptTimeline`).
- All new document fields are optional; existing storyboards and scripts load
  unchanged. Schemas stay `passthrough` where they are today.
- Extract and derive-scaffold are deterministic and covered by unit tests;
  only shot *content* (action, camera, motion) comes from a model.

## Success measures

- A script-first video needs zero manual re-typing of words into shots, and
  zero manual shot-duration entry for voiced shots.
- The prompt-first Studio flow lands the user on a linked pair in one step.
- The creative-pipeline eval passes a case that goes script → derived board →
  rendered → joint assemble → `validate_timeline` green.
- Unlinked flows produce byte-identical assembly output to today (regression
  tests on `buildStoryboardTimeline` / `buildScriptTimeline`).

## Rollout

Four phases, each shippable alone — see [tasks.md](tasks.md):

1. Link schema + extract-script-from-storyboard (unblocks board-first with
   real voicing; cheapest).
2. Derive-storyboard-from-script + audio-led timing.
3. Joint assemble + navigation.
4. Drift badges, Studio project cards, eval case, polish.

## Open questions

- **Multi-speaker in-shot dialogue.** A shot whose lines belong to several
  speakers assembles fine (clips carry `speaker`), but the ElevenLabs
  dialogue-mode question from the script concept doc applies here too.
  Deferred with it.
- **Narration vs. dialogue tracks.** V1 lays all takes on one voiceover
  track. One-track-per-speaker is a script-side option that already exists
  conceptually; revisit after use.
- **Re-derive semantics.** When the script gains a section after the board
  was derived, V1 offers "derive again" which appends/updates shots for
  unlinked lines and never deletes rendered shots. Anything smarter waits for
  evidence the simple rule hurts.
