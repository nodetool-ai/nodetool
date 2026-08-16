# Script ↔ Storyboard Link — Tasks

> Companion: [prd.md](prd.md), [design.md](design.md). Each phase ships
> alone. After any code change: `npm run typecheck && npm run lint &&
> npm run test && npm run test:packages` (scope package runs with
> `nodetool affected`).

## Phase 1 — Link schema + extract script from storyboard

- [x] **Protocol: link fields.** Add `script_id` to `Screenplay` and
      `script_line_ids`, `script_text_snapshot`, `duration_source` to `Shot`
      in `packages/protocol/src/creative.ts`; mirror in the zod shapes and
      key aliases in `packages/protocol/src/api-schemas/storyboards.ts`.
      Tests: normalization round-trips camelCase aliases; old documents
      parse unchanged.
- [x] **Protocol: `script-link.ts`.** `extractScriptFromScreenplay` +
      `validateScriptLink` per design §2.1/§1.3, with unit tests covering
      speaker matching via `entitiesForShot`, `voice_id` seeding, the
      shot→lines map, duplicate/dangling line references.
- [x] **Script back-pointer.** Nullable `storyboard_id` on the `scripts`
      table (`packages/models/src/schema/scripts.ts` + migration),
      `scriptResponse`/`patchScriptInput` in
      `packages/protocol/src/api-schemas/scripts.ts`, CAS patch in the
      `scripts` tRPC router.
- [x] **Headless tool: `extract_script_from_storyboard`.** In
      `packages/agents/src/capabilities/storyboards.ts` (creates script row,
      stamps link, sets back-pointer, `relink` re-projects). Tool-loop eval
      case in `packages/agents/src/evals/surfaces/storyboard.ts`.
- [x] **Web: extract + navigation.** `ui_storyboard_extract_script` in
      `web/src/lib/tools/builtin/storyboard.ts`; *Extract script* / *Open
      script* in the storyboard header; *Open storyboard* in the script
      header. Deletion downgrade both directions (design §4).
- [x] **Link validation on save.** Wire `validateScriptLink` into the
      storyboard normalize/save path; surface issues in both editors.

## Phase 2 — Derive board from script + audio-led timing

- [x] **Protocol: `deriveShotScaffold`.** In `script-link.ts` per design
      §2.2, unit-tested (order, one-line-per-shot default, narration vs.
      dialogue projection).
- [x] **Director variant.** Scaffold-constrained director pass; normalizer
      rejects responses that drop or reassign `script_line_ids` (retry, then
      fall back to scaffold-only shots). Lives with the existing director
      prompt path used by the storyboard agent.
- [x] **Headless tool: `derive_storyboard_from_script`.** In
      `packages/agents/src/capabilities/scripts.ts`; no-provider mode emits
      the deterministic scaffold. Eval case in
      `packages/agents/src/evals/surfaces/script.ts`.
- [ ] **Timing.** `linkedShotDurationMs` in
      `packages/timeline/src/script-link.ts` (design §2.3); storyboard
      editor and render tools read it when `duration_source !== "manual"`;
      `ui_storyboard_set_duration_source` toggle + inspector control.
- [x] **Web: derive.** `ui_script_derive_storyboard` in
      `web/src/lib/tools/builtin/script.ts`; *Create storyboard* button in
      the script editor.

## Phase 3 — Joint assemble

- [x] **`buildLinkedTimeline`.** `packages/timeline/src/linked.ts` per
      design §2.4. Unit tests: shot-aligned take starts, in-shot offsets
      with pauses, both linkage key families on voiceover clips, narration
      draft clip suppressed, `skippedLineIds`/`skippedShotIds`; regression
      fixtures proving unlinked `buildStoryboardTimeline` /
      `buildScriptTimeline` output is unchanged. Feed the built document to
      the timeline validator in tests.
- [ ] **Assemble switch.** `assemble_storyboard_timeline` (headless) and
      `ui_storyboard_assemble_timeline` / `ui_script_send_to_timeline` (web)
      call `buildLinkedTimeline` when linked; script-side button relabels to
      *Assemble video*. Re-assemble in place preserves foreign tracks (reuse
      the script re-assemble pattern).
- [ ] **Back-sync verification.** Jest tests that a re-voiced line and a
      revised shot both patch the same jointly-assembled sequence through
      the existing `timelineSync` modules, unmodified.
- [ ] **Creative-pipeline eval.** Case: script → derive → render (stubbed
      assets) → joint assemble → `validate_timeline` green, in
      `packages/agents/src/evals/surfaces/creative-pipeline.ts`.

## Phase 4 — Drift, Studio, polish

- [ ] **Drift helpers.** `shotDialogueDrifted`, `orphanedLineIds` (design
      §2.5) with tests; *Re-project* action updating snapshot + projected
      text in one CAS save.
- [ ] **Badges.** Drift badge + Re-project in the shot inspector; orphan
      badge in the script gutter; linked-line panel (speaker chip, voice
      status, play, voice-from-board) in the shot inspector; keyframe
      thumbnail chips in the script gutter.
- [ ] **Studio.** Prompt-first flow derives script + board linked in one
      pass; home groups linked documents into one project card
      (`web/src/studio/`).
- [x] **Tool/summary surface.** `get_storyboard` / `get_script` report link
      state, drift, and orphans (design §3.2).
- [x] **Harness registry.** Extend the storyboard/script surface entries in
      `packages/cli/src/harness/registry.ts` with the new deterministic
      selfchecks; `nodetool harness audit` stays clean.
- [x] **Docs.** Update `docs/script-editor-concept.md` (phase table) and
      `docs/agentic-video-product.md` (reuse table, home cards) to reflect
      the link; move this feature's status lines from Proposed to shipped
      per phase.
