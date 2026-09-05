# Guided Creation Flows — Tasks

> Companion: [prd.md](prd.md). Section numbers below point into it. Each
> phase ships alone and leaves `main` working. After any code change:
> `npm run test:affected && npm run typecheck && npm run lint &&
> npm run dev:nodetool -- harness gate --base origin/main`. A task that adds
> a check must be inverted once and seen red before it is ticked.

Ordering: P1 first. P2 and P3 are independent after P1. P4 depends on P3.
P6 depends on P1 and P2. P7, P8 and P9 depend on P2 only and are independent
of each other. Inside a phase, tasks are listed in dependency order.

## P1 — Storyboard contracts (no UI)

- [ ] **Protocol: board fields.** `setupStage` (enum, default `"done"`) and
      `genre` (default `""`) on `storyboardDocument` in
      `packages/protocol/src/api-schemas/storyboards.ts`. Tests: a document
      without either field parses with the defaults; every enum value round
      trips. (PRD § 7.7.1, § 7.7.7)
- [ ] **Protocol: scenes.** `Scene` interface and `Screenplay.genre`,
      `Screenplay.scenes`, `Shot.scene_id`, `Shot.camera.equipment` in
      `packages/protocol/src/creative.ts`. Mirror in the zod shapes and the
      key aliases (`sceneId → scene_id`). Test: an old screenplay parses, a
      camelCase agent payload normalizes. (PRD § 7.7.1, § 7.7.2)
- [ ] **Protocol: render record.** `RenderInputs` type and the optional
      `render_inputs` field on the version refs. `isVersionStale(shot, board)`
      as a pure function in `packages/protocol/src/creative.ts` or a sibling
      module. Tests: same inputs are not stale, each changed input is stale,
      no record is never stale, a keyframe-mode clip whose
      `source_version_id` is not the selected still is stale. (PRD § 7.7.4)
- [ ] **Protocol: prompt module.** `packages/protocol/src/shot-prompt.ts` with
      `keyframePrompt`, `clipPrompt`, `directClipPrompt` taking shot, scene
      and board style. Test table: every cell of the § 7.7.5 matrix, present
      for yes, absent otherwise, and `dialogue`, `notes`, `duration_seconds`
      never present. Then replace the three private helpers in
      `web/src/hooks/storyboard/useGenerateShot.ts` and the prompt builders
      behind `render_storyboard_stills` and `render_storyboard_clips` in
      `packages/agents/src/capabilities/storyboards.ts` with calls into it.
      A test in each caller asserts the composed prompt equals the module's
      output for a fixture shot. (PRD § 7.7.5, D8)
- [ ] **Protocol: Director schema.** `genre` as input and `scenes` plus
      per-shot `scene_id` and scene `lighting` as output in
      `buildScreenplaySchema` and `DIRECTOR_SYSTEM_PROMPT`
      (`packages/protocol/src/screenplay-authoring.ts`). Test: the schema
      requires every shot's `scene_id` to name a returned scene. Evaluate on
      the shipped example briefs and record the result in the PR; if shot
      quality drops, split into two calls (R1).
- [ ] **Store: ordering operations.** In
      `web/src/stores/storyboard/StoryboardStore.ts`: `moveShot`,
      `insertShot`, `duplicateShot`, `removeShot`, `updateScene`,
      `createScene`, `mergeSceneIntoPrevious`, each one undo entry ending in
      a full reindex, and `reorderShots` rejecting an order that breaks scene
      contiguity. Pure helpers `sceneOrder(shots, scenes)` and
      `displayNumber(shot, shots)` in `web/src/lib/storyboard/sceneOrder.ts`.
      Tests: contiguity and `0..n-1` after every operation on a 3-scene
      fixture, legacy unscened shots under the implicit header, first
      scene-creating operation assigns them, `duplicateShot` drops
      `script_line_ids`, `script_text_snapshot`, `covered_by` and sets
      `duration_source: "manual"`. (PRD § 7.7.3, § 7.7.6)
- [ ] **Store: style preset.** `setStylePreset(boardId, entityId)` removes
      every `style` entity from `entityIds`, adds the chosen one, sets
      `style` to its descriptor, drops per-shot exclusions of style entities,
      one undo entry. Test: character and location selections untouched.
      (PRD § 7.7.5)
- [ ] **Generation store: record on enqueue and land.** In
      `web/src/stores/storyboard/StoryboardGenerationStore.ts`, capture
      `RenderInputs` when a job is enqueued and write it onto the version
      when the asset lands. Test: a job enqueued before `setStylePreset` and
      landing after it reads stale through `isVersionStale`. (PRD § 7.7.4,
      criterion 8)
- [ ] **Assemble unchanged.** Regression test in `packages/timeline` that
      `buildStoryboardTimeline` output for a scened fixture equals the
      unscened fixture with the same `shot.index`. (PRD D5)
- [ ] **Tools.** In `web/src/lib/tools/builtin/storyboard.ts`:
      `ui_storyboard_set_setup`, `ui_storyboard_direct`,
      `ui_storyboard_move_shot`, `ui_storyboard_duplicate_shot`,
      `ui_storyboard_remove_shot`, `ui_storyboard_update_scene`,
      `ui_storyboard_create_scene`, `ui_storyboard_merge_scene`,
      `ui_storyboard_set_style`, `ui_storyboard_select_version`,
      `ui_storyboard_delete_version`, `ui_storyboard_add_keyframe_version`.
      Extend `ui_storyboard_set_screenplay` (genre, scenes, sceneId),
      `ui_storyboard_update_shot` (equipment, dialogue, notes,
      durationSource), `ui_storyboard_add_shot` (afterShotId),
      `ui_storyboard_generate_keyframe` and `_clip` (staleOnly). Mirror the
      headless equivalents in `packages/agents/src/capabilities/storyboards.ts`
      and their specs. Each new tool has a test in
      `web/src/lib/tools/builtin/__tests__/` and a row or gap note in
      `packages/cli/src/harness/capability-table.ts`. `npm run
      capabilities:check` passes. (PRD § 7.10)
- [ ] **Harness registry.** Add the P1 pure suites to the
      `script-storyboard-link` entry in
      `packages/cli/src/harness/registry.ts` so `harness gate` selects them
      for a diff under `web/src/lib/storyboard/` or
      `packages/protocol/src/shot-prompt.ts`. Confirm with `--dry-run` on a
      diff touching each.

## P2 — Shell and storyboard setup

- [ ] **Shell.** `web/src/components/setup/SetupFlow.tsx`: stepper, `Back`,
      primary button, step slot, per-flow config type (`labels`, `steps`,
      `plan`, `generate`). Renders inside a workspace tab and inside Studio.
      Tests: step labels from config, `Back` disabled on step 1, primary
      button label per step. (PRD § 6.2)
- [ ] **Shared pieces.** `OptionCardGrid`, `PresetTileGrid` (media sample,
      `Add your own` tile), `PlanReview` (section headers, inline fields,
      `Re-plan`), `AlternativesColumn` in `web/src/components/setup/`. Media
      through `ResponsiveImage` and `VideoPlayer` with `locator`. Tokens only.
      One test each. (PRD § 6.3)
- [ ] **Entry cards.** Five cards under the prompt card in
      `web/src/components/projects/NewProjectSurface.tsx` with the § 6.1
      promises. Storyboard live; the other four render disabled with a
      tooltip naming the phase that enables them. Clicking Storyboard
      creates the project row (`kind: "storyboard"`) and a board with
      `setupStage: "idea"` and the typed prompt as `brief`, then swaps the
      surface for `SetupFlow`. Test: a plain prompt and a `/skill` prompt
      still call `handleStart` and never mount the flow. (PRD § 6.1, D2)
- [ ] **Resume by stage.** `web/src/components/workspace/StoryboardSurface.tsx`
      and `web/src/studio/StudioStoryboardPage.tsx` render `SetupFlow` when
      `setupStage !== "done"`. Test: a board fixture at each stage mounts the
      matching step; a board without the field mounts the board. (PRD § 6.4,
      criterion 2)
- [ ] **Step 1.** Heading, subline, placeholder, three inspiration chips from
      the example boards' loglines (`trpc.storyboards.examples`),
      `AlternativesColumn` with blank storyboard and tutorial. Upload and CSV
      cards render disabled until P5. `Continue` writes `brief` and stage
      `genre`. `/` completion off inside the flow. (PRD § 7.1)
- [ ] **Step 2: genre.** Fourteen cards through `OptionCardGrid`. Fourteen
      `package://` stills under the example-board asset path
      (`packages/base-nodes/nodetool/assets/nodetool-base/storyboards/genres/`).
      That tree needs no per-file registration: `scripts/bundle-backend.mjs`
      copies `assets/nodetool-base/` wholesale, which is why no example-board
      still appears in `PACKAGE_RUNTIME_ASSETS` either — that registry is for
      files shipped beside a package's compiled `dist/`. Picking writes
      `genre`. (PRD § 7.2)
- [ ] **Step 2: Direct.** `useDirectScreenplay` takes `genre`; `Review your
      screenplay` runs it and sets stage `review` on success only. Test: the
      Director prompt contains the genre (criterion 3); a rejected call leaves
      stage `genre`.
- [ ] **Step 2: review.** `PlanReview` over the screenplay: scene headers with
      lighting, shots with action and dialogue, all inline-editable through
      `updateShot` and `updateScene`. `Re-direct` through `setScreenplay`.
      Test: an edit before `Continue` is the value that renders in step 3
      (criterion 4); Re-direct keeps ids and media of retained shots.
- [ ] **Studio extraction moves.** In `web/src/studio/useStudioPromptStart.ts`
      the `extract(boardId, …)` call moves out of the prompt start and into
      the flow's `Continue to storyboard` handler for Studio hosts. Test:
      extraction runs once, after review, from the reviewed screenplay
      (criterion 6). (PRD D9)
- [ ] **Step 3.** Aspect select from `ASPECT_OPTIONS`. `PresetTileGrid` over
      the seeded style entities (next task) running `setStylePreset`.
      `Generate your storyboard` sets stage `done`, enqueues stills through
      the existing batch path with its cost estimate, opens the board. Test:
      stage is `done` before the first job is enqueued; `style` being
      non-empty does not advance the stage. (PRD § 7.3, D3)
- [ ] **Seed style presets.** Twelve read-only system entities of kind
      `style` with descriptors and `package://` thumbnails, seeded alongside
      the example boards (`packages/websocket/src/lib/example-storyboards.ts`
      pattern). Test: seeding is idempotent; a user cannot patch a system
      entity. (PRD § 7.7.9)
- [ ] **Studio home.** Three entry cards (Storyboard, Video, Script) replace
      the single card in `web/src/studio/StudioHome.tsx`; Video and Script
      disabled until P6 and P7. Curated models, no pickers. (PRD D24)
- [ ] **Bridge during setup.** The setup hosts register the board on
      `storyboardAgentBridge` (`web/src/components/storyboard/storyboardAgentBridge.ts`)
      so `ui_storyboard_*` tools work in every step. Test: `ui_storyboard_set_setup`
      advances the stage while the flow is mounted. (PRD § 6.5)

## P3 — Storyboard board

- [ ] **Scene headers.** Group cards under headers from `sceneOrder` in
      `web/src/components/storyboard/StoryboardBoard.tsx`; `Scene N | Shot N`
      caption on `ShotCard` from `displayNumber`. Legacy boards show the
      implicit header. (PRD § 7.4, § 7.7.3)
- [ ] **Insert point.** `+` between cards on hover running `insertShot`.
- [ ] **Drag across scenes.** Existing drag handlers call `moveShot` with the
      target scene and position instead of `reorderShots`. Test: dropping
      past a header changes `scene_id` and reindexes (criterion 9).
- [ ] **Hover toolbar.** Drag handle, download (still or clip through the
      resolved media URL), duplicate (`duplicateShot`), delete (one confirm).
- [ ] **Entity chips and dialogue icon.** Render entity refs in the action as
      chips using the existing entity-ref parsing; filled dialogue icon when
      `dialogue` is non-empty, opening the Edit dialog (P4) or, until P4, the
      inspector. (criterion 12)
- [ ] **Footer.** `Edit · Iterate · Regenerate · Upload`. Upload creates a
      keyframe version from the uploaded asset and selects it (criterion 15).
- [ ] **Genre chip and Change Style.** Chip beside the title opening the
      genre grid as a popover; `Change Style` opening the preset grid as a
      dialog and running `setStylePreset`. (PRD § 7.4)
- [ ] **Stale marker and banner.** `ShotStatusPill` shows `stale` from
      `isVersionStale`; toolbar banner counts stale stills and clips;
      `Re-render stills` enqueues stills whose selected version is stale.
      Test: the banner renders nothing on its own (criterion 7). (PRD D12)
- [ ] **Retry N failed.** Toolbar action while any shot's last job failed;
      retries only those. (criterion 18)
- [ ] **Batch reattachment.** On board open, reconcile pending jobs by id
      through `StoryboardGenerationStore` and land finished assets as
      versions. If the store holds jobs in memory only, add a persisted
      pending-job list keyed by board (R4). Test: a board closed with a
      pending job and reopened after the job's `rpc_response` shows the
      version.
- [ ] **Measured remaining time.** Record job durations per model and kind
      in the generation store; show "~M:SS remaining" only when a record
      exists. Test: no record, no text (criterion 13). (PRD D14)
- [ ] **Next-steps strip.** `Extract script`, `Assemble timeline`.

## P4 — Storyboard Edit Shot dialog

- [ ] **Dialog shell.** `web/src/components/storyboard/ShotEditDialog.tsx`,
      full-screen, opened from `Edit`, the dialogue icon and the selection
      footer. Draft state for the table and header rows; `Save` commits one
      store update and one undo entry; `Regenerate` saves then renders;
      dirty close asks. Keyboard: `Esc`, `←`/`→`, `Cmd/Ctrl+S`. Tests:
      criterion 14. (PRD § 7.5, D11)
- [ ] **Viewer.** Pan, zoom, flip horizontal (new version through the
      canvas), `Open in image editor` returning the edit as a new version,
      version pager. Test: flip never overwrites (criterion 15).
- [ ] **Takes gallery.** Mount `ShotTakesGallery` in the right column.
- [ ] **Header row.** Slugline dropdown running `moveShot(shotId, sceneId,
      end)`; lighting editable through `updateScene`.
- [ ] **Table row.** Twelve columns per § 7.7.2. Aspect ratio read-only with
      a link to Board settings. Notes `Add +`. Equipment select from
      `cameraOptions.ts`.
- [ ] **Linked-board rules.** Dialogue read-only with `Edit in script`; ERT
      with the `from takes` / `pinned` chip and its toggle, moved from
      `ShotInspector.tsx`. Test: typing pins, the chip unpins and restores the
      takes' duration. (PRD D9)
- [ ] **Script panel.** Mount `ShotScriptPanel` below the table on linked
      boards.
- [ ] **Remove inspector fields.** Shrink the selection footer to `Edit`,
      `Iterate`, `Regenerate`, `Delete`. Delete the field editors from
      `ShotInspector.tsx` only after every field, the cost line, entity chips
      and the duration toggle exist in the dialog (R2). Update
      `web/src/components/storyboard/__tests__/`.

## P5 — Storyboard imports and custom style

- [ ] **Extraction route.** `POST /api/documents/extract-text` in
      `packages/websocket/src/routes/`, multipart, size-capped, dispatch by
      content type: PDF through the `pdfium` path in
      `packages/document-nodes`, DOCX through `extractRawText` in
      `packages/agents/src/host-modules/mammoth.ts`. Tests: a text PDF, a
      DOCX, a scanned PDF (empty text, 422 with the § 7.6 message), an
      unsupported type, an oversize body. (PRD § 7.6, D16)
- [ ] **`parseFdx`.** `web/src/lib/storyboard/parseFdx.ts`, pure: `Scene
      Heading`, `Action`, `Character`, `Dialogue`, `Parenthetical` to scenes,
      shots and verbatim dialogue. Fixture with two scenes and a
      parenthetical. Test: text and order preserved exactly (criterion 5).
- [ ] **`verifyImportedText`.** Pure. FDX mode restores dialogue and scene
      order and returns the corrected shot ids; plain-text mode returns the
      source lines no shot contains. Tests for both. (PRD § 7.2, D10)
- [ ] **Upload card.** Step 1 card wired to the route and to `parseFdx`;
      review notice from `verifyImportedText`. Director call in FDX mode asks
      for camera, motion and duration only.
- [ ] **`parseShotlistCsv`.** RFC 4180 through a real parser dependency
      (check the sandbox `csv` pack's library before adding one). Required
      headers, slugline detection, vocabulary matching, duration validation,
      empty-description skip, import report. Tests: criterion 17 cases plus
      a multiline quoted cell. Static template file served from the web
      public folder. (PRD § 7.7.8)
- [ ] **Import card.** Creates scenes and shots, sets stage `look`, shows the
      report, advances to step 3.
- [ ] **Add your own style.** One to three reference images to a language
      model descriptor, saved as a user `style` entity with the first image
      as thumbnail, then `setStylePreset`. Test: the preset it copies from
      is unchanged. (PRD § 7.3, § 7.7.9)
- [ ] **Harness registry.** Add the P5 pure suites to the
      `script-storyboard-link` entry.

## P6 — Video flow

- [ ] **Protocol.** Optional `setup` on the timeline sequence in
      `packages/protocol/src/api-schemas/timeline.ts` per PRD § 8.5. Test:
      a sequence without it parses. Beat id carried in clip metadata.
- [ ] **Format cards.** Seven cards with duration, width and height, fps,
      track layout, in `web/src/components/setup/video/formats.ts`. Test:
      each format produces a valid empty sequence.
- [ ] **Beat planner.** `planBeats` in `web/src/hooks/timeline/usePlanBeats.ts`:
      Director in direct mode with brief, duration and format, prompts
      composed through `shot-prompt`, writes `setup.beats`, stage `review`.
      Test: no clip and no job created (criterion 3). (PRD § 8.2, D20)
- [ ] **Review.** `PlanReview` over beats with duration sum against the
      format; `Re-plan`; `Continue to look` sets stage `look`.
- [ ] **Step 1 alternatives.** Drop media through
      `web/src/hooks/timeline/useVideoAudioImport.ts` placing clips in drop
      order, stage `format`; `Start from a script` hands the prompt to E3;
      blank sets `done`. Test: clips exist before any beat (criterion 1).
- [ ] **Look step.** Aspect from the format, video model tiles with sample
      clips (fetched on first use, not shipped, per R5), voice on/off with
      the E3 voice tile, music on/off, cost line from the timeline cost hook
      with the "unknown" fallback text. (PRD § 8.3)
- [ ] **Generate from beats.** `generateFromBeats`: one `text-to-video` clip
      per beat, one text-to-audio clip per voiced beat, at most one music
      clip, transitions from the beats, jobs through
      `useTimelineDirectGenJob`, stage `done`, open the timeline. Test:
      criterion 5 counts on a four-beat fixture.
- [ ] **Landing.** Placeholders with progress, per-clip Retry, `Retry N
      failed`, reattachment on open (shared approach with P3), next-steps
      strip `Export`, `Add captions`.
- [ ] **Tools.** `ui_timeline_set_setup`, `ui_timeline_plan_beats`,
      `ui_timeline_update_beat`, `ui_timeline_generate_from_beats` in
      `web/src/lib/tools/builtin/timeline.ts`, headless mirrors in
      `packages/agents/src/capabilities/timelines.ts`, capability table rows,
      an eval case in `packages/agents/src/evals/surfaces/timeline.ts`.
- [ ] **Entry.** Enable the Video card on the New Project surface and Studio
      home; resume by stage in the timeline surfaces.

## P7 — Script flow

- [ ] **Protocol.** Optional `setup` on `scriptDocument` in
      `packages/protocol/src/api-schemas/scripts.ts` per PRD § 9.5.
- [ ] **Format cards.** Five formats with cast shape and section layout, plus
      the length row.
- [ ] **Writer.** `writeScript` in `web/src/hooks/script/useWriteScript.ts`:
      `generate_text` with a structured script schema, imported text kept
      verbatim and only split and attributed, applied through the existing
      store, stage `review`. `Rewrite` keeps retained line ids. Tests:
      criteria 3 and 4.
- [ ] **`parseSrt`.** Pure, SRT and VTT to lines with target durations and a
      `Narrator` speaker, in `web/src/lib/script/parseSrt.ts`. Fixture test.
- [ ] **Step 1 alternatives.** Paste or upload through the P5 route and
      `parseFdx`, subtitles through `parseSrt`, blank sets `done`.
- [ ] **Review.** `PlanReview` over speaker, line, direction; edits through
      `ui_script_set_line_text` and `ui_script_set_speaker`; word count and
      spoken-length estimate at the flow's pace.
- [ ] **Voices step.** One `PresetTileGrid` row per speaker, a tile plays the
      speaker's first line in that voice (one TTS call per tile on demand,
      cached per session), language and pace selects, cost from
      `useVoiceCostEstimate`. `Voice your script` binds voices, runs
      `ui_script_voice_all`, stage `done`, opens the editor. Test: one voice
      per speaker, every line voiced once (criterion 5).
- [ ] **Tools.** `ui_script_set_setup`, `ui_script_write` in
      `web/src/lib/tools/builtin/script.ts`, headless mirrors in
      `packages/agents/src/capabilities/scripts.ts`, capability table rows,
      eval case in `packages/agents/src/evals/surfaces/script.ts`.
- [ ] **Entry.** Enable the Script card on both hosts; resume by stage in the
      script surfaces; next-steps strip `Create storyboard`, `Send to
      timeline`.

## P8 — Image flow

- [ ] **Protocol.** Optional `setup` on the sketch document in
      `packages/protocol/src/api-schemas/sketch.ts` per PRD § 10.5, mirrored
      in `web/src/components/sketch/state/slices/documentSlice.ts`.
- [ ] **Use-case cards.** Seven cards with default size, composition guidance
      and default variation count.
- [ ] **Brief refinement.** `expandBrief` in
      `web/src/hooks/sketch/useRefineBrief.ts`: structured fields (subject,
      composition, lighting, style words, negative), stage `review`. Test: no
      layer and no job (criterion 3).
- [ ] **Review.** `PlanReview` over the fields, variation chip 1, 2, 4,
      `Re-refine`.
- [ ] **Look step.** Size tiles per aspect with pixel sizes, the twelve style
      entities (shared with E1, D21), image model tiles with samples fetched
      on first use, cost from the sketch estimate times the count.
- [ ] **Generate.** N generated layers through the `text-to-image`
      `layerWorkflowBinding`, same prompt, size and model, differing by seed,
      stage `done`. Test: criterion 4.
- [ ] **Contact sheet.** `web/src/components/setup/image/ContactSheet.tsx`:
      the N variations as they land, `Pick`, `Regenerate`, `Download`. `Pick`
      opens the sketch editor with the picked layer visible and the others
      hidden with their `layerVersion` records. Strip: `Make more
      variations`, `Use in a storyboard` (creates an entity from the picked
      layer). Test: criterion 5.
- [ ] **Step 1 alternatives.** Upload as first layer with stage `done`; blank
      canvas.
- [ ] **Tools.** `ui_sketch_set_setup`, `ui_sketch_refine_brief` in
      `web/src/lib/tools/builtin/sketch.ts`, headless mirrors in
      `packages/agents/src/capabilities/sketches.ts`, capability table rows,
      eval case in `packages/agents/src/evals/surfaces/sketch.ts`.
- [ ] **Entry.** Enable the Image card on the New Project surface (not
      Studio, D24); resume by stage in `SketchSurface.tsx`.

## P9 — Workflow flow

- [ ] **Settings shape.** `settings.setup` per PRD § 11.5, validated with a
      zod schema in `packages/protocol/src/api-schemas/workflows.ts`. Step id
      carried in node metadata.
- [ ] **Category cards.** Six categories with planner bias and default run
      mode.
- [ ] **Planner.** `planWorkflow` in `web/src/hooks/workflow/usePlanWorkflow.ts`:
      `generate_text` with a structured plan schema, node types resolved
      through `search_nodes`, provider and model roles checked against the
      configured providers, stage `review`. Tests: every step names a
      registry node type or `null`; each needed provider is marked; no node
      placed (criterion 3).
- [ ] **Review.** `PlanReview` over inputs, steps, outputs with reorder, add,
      remove; red marker and search field for an unknown type; amber marker
      and `Connect` (through `openProviderOnboarding`) for a missing
      provider; `Continue to setup` disabled until both clear. Test:
      criterion 4. (PRD D23)
- [ ] **Setup step.** Model tile row per role from configured providers; run
      mode cards `Run by hand`, `App with a form`, `On a trigger`; sample
      inputs prefilled by the planner.
- [ ] **Build from plan.** `buildFromPlan`: `ui_add_node`,
      `ui_connect_nodes`, `ui_update_node_data` in plan order, then
      `validate_workflow`, then one run with the sample inputs, stage `done`,
      canvas open as soon as nodes are placed. Test: each inspiration chip's
      plan builds a graph that passes `validate_workflow` (criterion 5).
- [ ] **Landing checklist.** In the agent panel: `Graph built`, `Validated`,
      `Test run` with outcome, run-mode next step (`Save as app`, `Add a
      trigger`). A validation error or failed run lands as the first agent
      message with the fix proposed, nothing auto-applied.
- [ ] **Step 1 alternatives.** Examples browser inline (copy sets `done`),
      import JSON or DSL (`done`), blank (`done`).
- [ ] **Tools and harness.** `ui_workflow_set_setup`, `ui_workflow_plan`,
      `ui_workflow_update_plan_step`, `ui_workflow_build_from_plan` in
      `web/src/lib/tools/builtin/`, headless mirrors in
      `packages/agents/src/capabilities/workflows.ts`, capability table rows,
      and a plan-to-graph case in the app-build harness that grades the test
      run's output, not only validation (R6).
- [ ] **Entry.** Enable the Workflow card on the New Project surface (not
      Studio); resume by stage in the workflow editor surface.

## Cross-cutting, every phase

- [ ] UI primitives only, design tokens only, media through `ResponsiveImage`
      / `VideoPlayer` / `AudioPlayback` with `locator`.
- [ ] Every new `ui_*` tool has a capability table row or a gap note, and
      `npm run capabilities:check` passes.
- [ ] Every new check was inverted once and seen red; the failing command is
      in the PR's Verification section.
- [ ] `docs/creation-flows/prd.md` is updated in the same PR when a phase
      changes a contract it states.
- [ ] Shipped assets (genre stills, style thumbnails) live under
      `packages/base-nodes/nodetool/assets/nodetool-base/`, which
      `scripts/bundle-backend.mjs` copies wholesale — no `PACKAGE_RUNTIME_ASSETS`
      entry, which is for files shipped beside a package's compiled `dist/`.
      A registered path with no file behind it fails `npm run backend:smoke`,
      so register nothing you have not shipped. Each asset stays under the
      example-board size budget (PRD R5).
