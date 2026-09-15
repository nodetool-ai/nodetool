# PRD: Native AI Media Editing

**Status:** Draft
**Baseline:** `main` at `1d16ec8`
**Tasks:** [tasks.md](tasks.md)
**Related:** [AI Timeline Editing](../ai-timeline-editing.md), [Video Editor](../video-editor.md), [Media Generation Tracking](../media-generation-tracking-design.md), [Timeline Editor PRD](../timeline-editor-prd.md)

## 1. Summary

NodeTool will edit existing media through fixed actions on the media itself.
The primary interaction is:

> Select a clip, choose an action, generate a candidate, audition it in the
> current cut, then apply it.

The first release ships one complete action: **Edit video**. It works for an
imported or generated video clip, sends only the source window used by that
clip, keeps the accepted take playing while generation runs, stores the result
as an inactive candidate, and applies it through one undoable **Use take**
operation.

This is not a workflow feature and does not add a Maestro mode. Workflows may
remain part of a clip's creation history, but the editing interaction neither
creates nor exposes a graph.

## 2. Problem statement

NodeTool can generate timeline media and can revise a storyboard clip through
`video_edit`, but it does not provide one reliable editing interaction for any
existing timeline clip.

The current pieces disagree at important boundaries:

- `useTimelineDirectGenJob` activates a successful result immediately and
  clears its trim points.
- `composeGenerativeTakePatch` stores a generated result as an inactive take
  unless the caller explicitly activates it.
- `ClipVersionHistory` restores a take as soon as its tile is clicked. It does
  not distinguish auditioning from accepting.
- `generateRevisedClip` gives storyboards a direct `video_edit` path, but that
  path is separate from timeline generation and does not establish shared
  candidate semantics.
- `packages/timeline/src/generative.ts` plans several operations, but no
  product surface drives that planner today.
- A generative request does not yet describe the selected clip's source
  window and time mapping. Editing a four-second excerpt can therefore target
  the wrong frames or apply an invalid old trim to a new four-second asset.

The result is useful groundwork without a safe end-to-end edit.

## 3. Product principles

- **D1. Editing belongs to the selected media.** Imported footage, direct
  generations, and workflow-generated clips receive the same eligible actions.
- **D2. Generation and editing stay separate.** Generation describes how the
  original shot was made. AI Edit transforms the selected take. Takes stores
  the alternatives.
- **D3. Every result starts as a candidate.** Completion never changes the
  accepted cut. Applying a candidate requires **Use take**.
- **D4. Preserve the cut, not old source-time numbers.** Apply rules preserve
  what plays, where it plays, and the unrelated editorial state. They remap or
  replace source-time fields when the generated asset has a different source
  timeline.
- **D5. The entry surface owns the destination.** A timeline edit creates a
  take on one clip instance. A storyboard edit creates a candidate for one
  shot. A library edit creates a derived asset.
- **D6. Actions filter models.** The selected action determines the required
  task or capabilities. The model that created the source is only a default
  when it is eligible.
- **D7. No substitute operation is silent.** Image-to-video from the last
  frame is not video extension. Prompt restyling is not masked replacement.
- **D8. Inspector and agent use the same operation.** Both call the same
  validation, submission, landing, audition, and apply logic.
- **D9. Changes stay local by default.** Editing one timeline clip does not
  replace its source asset elsewhere or update its storyboard shot, entity, or
  voice definition.

## 4. Current state

| Existing component | What exists | Boundary for this PRD |
| --- | --- | --- |
| `web/src/components/timeline/Inspector/DirectGenClipPanel.tsx` | Prompt, model, output settings, cost estimate, and direct generation controls. | Reuse its controls and model catalog patterns. AI Edit sits outside the generation panel dispatcher. |
| `web/src/hooks/timeline/useTimelineDirectGenJob.ts` | Direct `generate_media` submission, persisted pending requests, generation lookup, recovery, and asset landing. | Extract or extend the reusable lifecycle. Do not reuse its automatic activation and trim reset for edits. |
| `web/src/hooks/storyboard/useGenerateShot.ts` | `generateRevisedClip` submits `mode: "video_edit"` with the shot clip as source. | Route storyboard revisions through the same editing request and candidate rules. |
| Server `generate_media` video-edit branch | Calls `provider.videoToVideo()` and stores the resulting asset. | Keep this direct execution path for P0. Complete its input and capability validation contract. |
| `web/src/components/timeline/Inspector/ClipVersionHistory.tsx` and `packages/timeline/src/takes.ts` | List, select, rename, and delete `ClipVersion` takes. | Extend this system with candidate audition and explicit acceptance. Do not create another history model. |
| `packages/timeline/src/generative.ts` | Plans extend, range replacement, object edits, restyle, and regenerate. `composeGenerativeTakePatch()` defaults to an inactive take. | Reuse its provider-independent planning and candidate composition after completing source context and provider mapping. |
| `web/src/components/timeline/Inspector/ClipTracking.tsx` | Numeric initial region controls. **Track subject** is disabled because no provider is connected. | Object and character actions remain unavailable until preview selection and tracking execution exist. |

The guide at `docs/ai-timeline-editing.md` describes several intended
operations. It is not evidence that every operation is executable.

## 5. Users and surfaces

### 5.1 Timeline

The selected clip inspector gains an **AI Edit** section. Eligible actions also
appear in the clip context menu. This section is independent of
`bindingKind`, `sourceType`, and workflow ownership.

The existing concepts remain distinct:

| Inspector concept | Meaning |
| --- | --- |
| Generation | Inputs and binding that created the original shot. |
| AI Edit | A transformation of the selected take. |
| Takes | Original, accepted, and candidate alternatives for this clip. |

The top-level Generate control continues to create media. Editing requires an
explicit target and starts from a selected clip or cut.

### 5.2 Preview

P0 adds candidate auditioning to the existing preview:

- The accepted take remains active while a request is queued, running, failed,
  or completed.
- Selecting a candidate for audition changes preview state only. It does not
  mutate the persisted clip.
- Original and candidate playback use the same relative position in the clip.
- **Original**, **Candidate**, and **Use take** controls are explicit.
- Closing the audition or selecting another clip discards preview-only state.
- **Use take** applies the candidate in one undo entry.

Mask drawing, subject selection, and tracking overlays are not part of P0.

### 5.3 Storyboard

**Revise take** uses the same validated `video_edit` submission and provenance
contract. The result lands as a shot clip candidate. It does not replace the
selected shot clip until the creator accepts it.

### 5.4 Asset library and other destinations

Controls may be reused later, but each entry point has a fixed default result:

| Entry point | Default result |
| --- | --- |
| Timeline clip | Candidate take for that clip instance. |
| Storyboard shot | Candidate for that shot. |
| Asset library | New derived asset. Existing references stay unchanged. |
| Selected cut | Transition or bridge candidate with cut-specific timing. |
| Audio or dialogue clip | Audio take or aligned replacement layer. |

P0 covers timeline clips and storyboard shots only.

## 6. Action model

| Action | Interaction | Result | Release gate |
| --- | --- | --- | --- |
| Edit video | Select a clip, enter an instruction, choose an eligible model and optional model-supported strength. | Candidate video take. | P0, existing `video_edit` execution. |
| New take | Rerun known creation inputs, optionally with changed direction. | Alternative generation from the recipe, not a pixel transformation. | P1, only when original inputs are complete. |
| Extend | Choose start or end, added duration, and continuation intent. | Longer source candidate plus an explicit timing choice. | P1, genuine extension provider task required. |
| Change line delivery | Choose a script-linked voiced clip and direction. | Speech take aligned to the line. | P1, reuse Script cast and line data. |
| Remove subject | Select a preview region or subject. | Masked and tracked edit candidate. | P2, preview selection, mask preparation, tracking, and inpaint task required. |
| Replace subject or character | Select a subject, then an Entity, reference image, or instruction. | Reference-conditioned masked edit candidate. | P2, references must reach the provider call. |
| Expand frame | Choose target framing and generated sides. | Spatially expanded candidate. | P2, outpaint task required. |
| Enhance or upscale | Choose an eligible enhancement and target resolution. | Higher-resolution candidate. Sequence dimensions stay unchanged. | P2, enhancement task required. |
| Generate sound | Use clip timing and available scene context. | Aligned audio layer or audio take. | P2, video-conditioned audio task required. |
| Change voice | Choose another delivery or replace recorded speech. | Speech take, replacement layer, or lip-synced candidate depending on the chosen operation. | P2, isolation and lip-sync are separate capabilities. |
| Generate transition | Select a cut between adjacent clips and set overlap or duration. | Cut-level transition candidate. | P2, dedicated cut apply operation required. |

**New take** and **Edit video** never share a label. Imported footage offers
**Edit video**, but does not offer **New take** unless NodeTool has an explicit
reproducible generation recipe.

The initial reference-conditioned production route and the production-flow
definition of **New take** are specified in [AI Video Production](../creation-flows/ai-video-production-prd.md).
This document owns the independently shippable P0 **Edit video** path,
including its source-window rules and candidate application semantics.

## 7. P0 requirements: Edit video

### 7.1 Eligibility

The action is enabled when all of the following are true:

- Exactly one video clip is selected.
- The clip has an active stored asset.
- The clip has a positive playable duration.
- The source window can be represented as an ordinary constant-speed range.
- At least one available model supports the video-to-video task.

P0 rejects reverse playback, speed ramps, discontinuous mappings, and other
complex retiming with a message that explains the unsupported edit. It does
not process a different range as a fallback.

### 7.2 Source context

Submission captures an immutable source snapshot before the request is sent:

```ts
interface MediaEditSourceContext {
  sequenceId: string;
  clipId: string;
  sourceAssetId: string;
  sourceTakeId?: string;
  sourceStartMs: number;
  sourceEndMs: number;
  timelineStartMs: number;
  timelineDurationMs: number;
  speedMultiplier: number;
}
```

For a clip that plays source seconds 40 through 44, the edit input contains
that four-second window. If the server must materialize the range before
calling a provider, the materialized asset becomes an intermediate generation
input, not a replacement for the library source.

The output contract states whether the result represents the selected window
from zero or preserves source time. P0 expects a window-relative output whose
playable range starts at zero.

### 7.3 Request and model selection

The UI chooses `video_edit` before choosing a model. The model list contains
only catalog entries that support the mapped video-to-video task.

Cloud shows the managed default and a small eligible alternative list without
provider selection. Local builds retain provider and model controls. An
ineligible remembered model is replaced by the eligible default or produces a
clear choice request when no default exists.

Submission uses the existing `generate_media` lifecycle, project context,
generation record, asset storage, spend handling, cancellation, and recovery.
The request stores its action and source snapshot before dispatch.

### 7.4 Candidate landing and provenance

The result is appended to the existing take list through
`composeGenerativeTakePatch()` or a shared equivalent. Landing does not change
`currentAssetId`, `activeTakeId`, trim fields, clip status that controls the
accepted media, or timeline structure.

Before the first edit of a clip whose active asset is not represented in
`versions`, NodeTool records that active media as the baseline take.

Each editing take records:

- Parent take and source asset.
- Source window and time mapping captured at submission.
- Action and submitted parameters.
- Instruction, references, provider, and model.
- Request or generation identifier.
- Result asset, duration, status, cost, and creation time.

These values come from the submitted request snapshot. Landing never rebuilds
provenance from mutable clip fields.

### 7.5 Audition and apply

The candidate tile has a non-persisted **Preview** action and a persisted
**Use take** action. Previewing at clip-relative time `t` reads candidate time
`t`, clamped to the candidate duration.

Applying a normal full-window edit:

- Sets the candidate as `currentAssetId` and `activeTakeId`.
- Preserves clip `startMs`, `durationMs`, track, effects, transform, animation,
  captions, links, mute state, and unrelated audio.
- Maps the generated window to source time zero, so `inPointMs` becomes `0`
  and `outPointMs` becomes the applied playable duration, or uses the
  repository's absent-field convention when zero-to-duration is implicit.
- Refuses a result shorter than the current timeline duration unless the
  creator explicitly trims the cut or chooses another take.
- Keeps extra result duration as unused source handles. It does not lengthen
  the cut automatically.
- Runs as one undoable timeline store operation.

Applying a take affects only the selected timeline clip. A separate command
may later update the originating storyboard shot.

### 7.6 Failure, cancellation, and concurrency

- A failed, cancelled, expired, or recovered request leaves the accepted take
  and cut unchanged.
- The failed request remains inspectable through generation history and can be
  retried with its captured inputs.
- One clip can have at most one active AI Edit submission in P0.
- Switching sequences or selected clips while a request runs cannot redirect
  its result. Destination identifiers are captured at submission.
- Deleting the destination before completion settles the request without
  recreating the clip. The generated asset remains available through the
  generation record.

## 8. Shared execution boundary

The implementation has five shared operations:

1. Capture and validate the editing target and source context.
2. Resolve eligible models and prepare provider inputs.
3. Submit and recover a direct generation.
4. Attach the result as a candidate with immutable provenance.
5. Audition and apply the candidate with destination-specific rules.

The timeline inspector, storyboard revision control, and agent bridge call
these operations. They do not write asset or take fields independently.

The existing direct-generation hook remains valid for creating new media. Its
completion policy must not be used for editing because it activates the output
and clears trims.

## 9. Agent behavior

The timeline agent receives an explicit operation with sequence and clip
targets. A request such as "make this station deserted at night" creates a
candidate and returns its take and generation identifiers. It does not apply
the candidate unless the request explicitly asks to use it.

Agent execution uses the same eligibility checks, source-window capture,
model filtering, request snapshot, landing, and apply operation as the
inspector. Headless and browser-host execution must produce the same stored
take.

## 10. Testing decisions

| Requirement | Test boundary |
| --- | --- |
| A trimmed imported clip sends only its playable source window. | Pure source-context tests plus a fake-provider integration test around `generate_media`. |
| Complex retiming is rejected before spend. | Planner tests in `packages/timeline/tests/`. |
| Completion adds an inactive candidate and preserves the accepted cut. | Timeline store and direct-generation landing tests. |
| The first edit preserves imported media as a baseline take. | Timeline take composition test. |
| Provenance reflects submission-time values after the clip is edited while a job runs. | Delayed fake-provider test that mutates the clip before landing. |
| Recovery lands the same candidate once. | Pending-request reload and reconnect tests based on `useTimelineDirectGenJob` recovery coverage. |
| Preview changes no document state. | React Testing Library test around preview selection and `ClipVersionHistory`. |
| **Use take** is one undo step and preserves unrelated clip fields. | Timeline store reducer test with a fully populated clip fixture. |
| Model selection contains only video-edit-capable models. | Model-task matching hook test. |
| Storyboard and timeline produce the same request and provenance fields. | Shared request builder contract test plus each host adapter test. |
| The agent creates a candidate through the same operation. | Timeline tool bridge test and harness selfcheck. |

P0 adds a fake-provider vertical integration test that selects a trimmed
imported clip, submits an edit, reloads before completion, lands the candidate,
auditions it, applies it, undoes once, and verifies the original cut.

## 11. Success criteria

P0 ships when:

1. Any eligible imported or generated video clip exposes **Edit video** in the
   inspector and clip context menu.
2. A creator can submit an instruction with a compatible model and see an
   estimate before generation where pricing is available.
3. The provider receives only the clip's selected source window.
4. The accepted take keeps playing throughout submission and completion.
5. The result appears as an inactive candidate with complete submission-time
   provenance.
6. The creator can compare original and candidate at the same relative time.
7. **Use take** applies the candidate without moving or lengthening the cut and
   one undo restores the prior take.
8. Closing and reopening the sequence recovers a pending or completed request
   without duplicating the candidate.
9. Storyboard **Revise take** follows the same request and candidate rules.
10. The agent can request the same operation and returns a candidate without
    applying it by default.

## 12. Out of scope for P0

- User-authored workflows, action marketplaces, and a Maestro mode.
- Library editing controls.
- New take, extension, partial-range replacement, and ripple decisions.
- Region drawing, masks, tracking execution, object removal, and character
  replacement.
- Entity-conditioned video editing until references reach the provider call.
- Frame expansion, enhancement, upscaling, transition generation, sound
  effects, speech isolation, voice conversion, and lip-sync.
- Automatic updates to storyboard media, other timeline instances, entities,
  voices, sequence format, or export dimensions.

## 13. Risks

- **R1. Providers interpret duration and source ranges differently.** Normalize
  a window-relative input before the provider boundary and test each supported
  adapter.
- **R2. Preview-only state can leak into persistence.** Keep audition state in
  the timeline UI or playback store, outside the document store.
- **R3. Existing take clicks mutate the cut.** Introduce explicit Preview and
  Use take commands before exposing candidates.
- **R4. Mutable completion handlers corrupt provenance.** Persist the request
  snapshot before dispatch and land from that snapshot only.
- **R5. Documentation overstates capability readiness.** Action visibility
  comes from executable provider tasks and prerequisites, not the planner's
  vocabulary or documentation alone.
