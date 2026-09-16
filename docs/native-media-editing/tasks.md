# Native AI Media Editing Tasks

> Companion: [prd.md](prd.md). Each phase leaves `main` working. Tasks are in
> dependency order inside a phase. After code changes run:
> `npm run test:affected && npm run typecheck && npm run lint && npm run
> dev:nodetool -- harness gate --base origin/main`.

## Delivery graph

- P0 ships **Edit video** for timeline clips, shared storyboard revision, and
  agent parity.
- P1 adds recipe-based **New take**, true extension, and script-aware voice
  revision. P1 starts after P0.
- P2 connects spatial selection, tracking, references, and the remaining fixed
  actions. Each action stays hidden until its provider task and apply rule are
  executable.

## P0: Edit video

- [x] **T01: Edit one trimmed clip into an inactive candidate.** Add a shared
      media-edit request that captures sequence, clip, active take, source
      asset, playable source window, timeline placement, and constant speed
      before dispatch. Map `video_edit` to model task support, submit through
      `generate_media`, and land through `composeGenerativeTakePatch` without
      changing the active take or trims. Reject complex retiming before spend.
      Reuse pending-request persistence, generation lookup, cancellation, and
      reconnect recovery from
      `web/src/hooks/timeline/useTimelineDirectGenJob.ts`. Store the immutable
      request snapshot with the pending entry so landing does not read mutable
      clip fields. Likely touchpoints:
      `packages/timeline/src/generative.ts`,
      `packages/protocol/src/api-schemas/timeline.ts`,
      `web/src/hooks/timeline/`,
      `packages/websocket/src/session/commands.ts`, and
      `packages/websocket/src/session/inference.ts`.
      Tests: a fake-provider integration edits source seconds 40 through 44,
      mutates the clip before completion, reloads, and receives exactly one
      inactive take with the submitted provenance. (PRD § 7.1 to § 7.4)

- [x] **T02: Expose Edit video in the selected clip UI.** Add an **AI Edit**
      section outside the generation-panel `bindingKind` dispatch in
      `web/src/components/timeline/Inspector/TimelineInspector.tsx`. Add the
      same action to
      `web/src/components/timeline/Tracks/ClipContextMenu.tsx`. Render instruction, eligible model,
      supported strength when present, estimate, submit, progress, cancel,
      retry, and actionable errors with existing inspector primitives. Imported
      and generated video clips follow identical eligibility rules. Cloud hides
      provider selection and local builds keep existing provider controls.
      Tests: imported, direct-generated, and workflow-bound clips expose the
      action; audio, missing media, complex retiming, and no-compatible-model
      fixtures explain why it is unavailable. Blocked by T01. (PRD § 5.1,
      § 7.1, § 7.3)

- [x] **T03: Preserve a baseline and audition candidates without changing the
      cut.** Before the first edit, add the active imported or generated asset
      as a baseline take when no version represents it. Extend
      `ClipVersionHistory` with explicit Preview, Original, Candidate, and Use
      take controls. Store audition state outside the timeline document. Sync
      original and candidate preview at clip-relative time and clear audition
      state when selection changes. Tests prove preview does not call
      `restoreVersion`, change `currentAssetId`, or create an undo entry.
      Blocked by T01. (PRD § 5.2, § 7.4, § 7.5)

- [x] **T04: Apply a candidate as one editorial operation.** Add a shared take
      apply helper and one TimelineStore action that sets `currentAssetId` and
      `activeTakeId`, maps the window-relative result to source time zero, and
      preserves placement, duration, track, effects, transform, animation,
      captions, links, mute state, and unrelated audio. Reject a candidate that
      cannot cover the current duration. Keep extra duration as unused handles.
      One undo restores the prior take and mapping. Route **Use take** through
      this operation. Tests use a fully populated clip and verify every
      preserved field plus undo and redo. Blocked by T03. (PRD § 7.5)

- [x] **T05: Make request lifecycle destination-safe.** Persist destination
      sequence and clip identifiers with the submitted snapshot. A result
      cannot land on the sequence open at completion, recreate a deleted clip,
      or append twice after socket response and generation lookup race. Keep
      failed and cancelled requests inspectable without changing accepted
      media. Add reconnect, switched-sequence, deleted-clip, cancellation, and
      duplicate-settlement tests beside the current direct-generation recovery
      coverage. Blocked by T01. (PRD § 7.6)

- [x] **T06: Route storyboard Revise take through the shared edit path.** Replace
      the private request construction in
      `web/src/hooks/storyboard/useGenerateShot.ts` with the P0 request builder
      and generation lifecycle adapter. Land the result in the shot's existing
      clip-version system as an inactive candidate. Accepting it changes only
      that shot. Keep shot and timeline destination adapters separate while
      sharing validation, submission, and provenance. Tests compare the
      submitted request and take metadata from both hosts. Blocked by T01 and
      T04. (PRD § 5.3, § 8)

- [x] **T07: Give the timeline agent the same edit and apply operations.** Add
      explicit target and instruction contracts to the existing timeline
      frontend tool and handler bridge. Default to returning a candidate take
      and generation id without applying it. An explicit apply call uses the
      same T04 operation. Update the protocol contracts, browser handler,
      headless timeline capability or gap table, and surface eval. Add a
      harness selfcheck that edits a trimmed clip, inspects the inactive take,
      applies it, then undoes once. Blocked by T04 and T05. (PRD § 9)

- [x] **T08: Add the P0 vertical acceptance journey.** Run a fake-provider
      journey from an imported trimmed clip through inspector submission,
      reload recovery, candidate comparison, Use take, render selection, and
      undo. Assert no workflow is created and no other clip or storyboard shot
      changes. Register the journey with the timeline harness gate. Blocked by
      T02, T04, T05, T06, and T07. (PRD § 10, § 11)

## P1: Known-input alternatives

- [ ] **T09: Generate New take from a known recipe.** Derive a reproducible
      recipe from the selected take's captured generation inputs. Show **New
      take** only when prompt, references, task, and required model settings are
      known. Submit a new generation rather than `video_edit`, land it as an
      inactive candidate, and reuse P0 audition and apply. Imported recordings
      without a recipe do not show the action. Blocked by T08. (PRD § 6)

- [ ] **T10: Extend a clip with explicit timing choices.** Connect the planner's
      `extend` operation only to models with a genuine extension task. Choose
      start or end, duration, and direction, then create a longer candidate.
      Applying offers three explicit outcomes: keep the cut and retain source
      handles, extend into available space, or ripple later clips. Each outcome
      is one undoable timeline operation and refuses collisions it cannot
      resolve. Do not substitute last-frame image-to-video. Blocked by T08.
      (PRD § 6)

- [ ] **T11: Revise a script-linked line delivery.** Resolve line text, cast
      member, voice, language, pace, and timing from Script data. Generate an
      alternative speech take and align it without asking for known context
      again. Keep recorded-speech replacement, isolation, voice conversion,
      and lip-sync as separate unavailable actions. Blocked by T08. (PRD § 6)

## P2: Spatial and capability-dependent actions

- [ ] **T12: Select and track a subject on the preview.** Replace numeric-only
      region entry with normalized preview selection and overlay rendering.
      Connect a real tracking provider to the seam in
      `packages/agents/src/capabilities/timeline-track-object.ts`. Store samples
      in the existing `MediaTrack` model and invalidate them when the active
      source changes. Keep the action disabled when no execution provider is
      available. Blocked by T08. (PRD § 6)

- [ ] **T13: Forward Entity and reference inputs through video edits.** Extend
      the video-edit provider request and model-task validation so selected
      Entity reference images and explicit asset references reach compatible
      providers. Record reference ids on the take. Selecting an Entity never
      mutates its definition or recasts a storyboard. Blocked by T08. (PRD § 6)

- [ ] **T14: Remove or replace a selected subject.** Use T12 tracks and masks
      with providers that declare inpaint, mask input, and, for replacement,
      object-replace support. A replacement accepts an instruction or T13
      references. Land an inactive video candidate and reuse P0 comparison and
      apply. Refuse stale tracks and missing mask support before spend. Blocked
      by T12 and T13. (PRD § 6)

- [ ] **T15: Replace a character with an Entity.** Build the fixed character
      replacement interaction on T14 with an Entity picker and identity
      reference preview. Require reference-conditioned provider support. Do not
      present prompt restyling as identity replacement. Blocked by T14.
      (PRD § 6)

- [ ] **T16: Expand frame and upscale as distinct actions.** Expand frame
      chooses target aspect and generated sides and requires an outpaint task.
      Upscale chooses an enhancement operation and result resolution. Both
      create candidates. Neither changes sequence dimensions or reframes
      existing pixels automatically. Blocked by T08. (PRD § 6)

- [ ] **T17: Generate video-conditioned sound as an aligned audio result.** Use
      the selected clip window and scene context with a provider task that
      accepts video or timed scene input. Create an aligned audio clip or take
      on an audio track. Never replace the entire video soundtrack silently.
      Blocked by T08. (PRD § 6)

- [ ] **T18: Add recorded voice replacement and lip-sync as separate actions.**
      Voice replacement requires speech isolation or an explicit clean speech
      source. Lip-sync consumes the accepted replacement line and produces a
      video candidate. Model selection and copy state which operation will run.
      Blocked by T11 and provider support for each task. (PRD § 6)

- [ ] **T19: Generate a transition at a selected cut.** Target two adjacent
      clips and an explicit overlap or duration. Store the result as a cut-level
      candidate, preview it across the edit, and apply it through a dedicated
      undoable cut operation. Do not store it as a normal replacement take for
      either source clip. Blocked by T08. (PRD § 5.4, § 6)

## Completion checks

- [x] Every visible action has an executable provider task and an apply rule.
- [x] Every action stores submission-time provenance on its result.
- [x] Browser and agent paths call the same validation and application logic.
- [x] No action creates or exposes a workflow.
- [x] Existing assets, other timeline instances, storyboard shots, Entities,
      voices, and sequence dimensions remain unchanged unless the creator
      invokes a separate scoped operation.
