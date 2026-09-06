# Graph Resources — Tasks

> Companion: [design.md](design.md). Each phase ships alone and leaves the
> repo green. After any code change run the four mandatory checks
> (`npm run test:affected`, `npm run typecheck`, `npm run lint`,
> `npm run dev:nodetool -- harness gate --base origin/main`).

## Phase 1 — Types and entity nodes

- [x] **Protocol: `StoryboardRef`.** Add to `packages/protocol/src/api-types.ts`
      next to `ScriptRef`, with the `writable` flag (design §2.1); `storyboardRefDefault` in
      `packages/core-nodes/src/nodes/ref-defaults.ts`;
      `nodetool.constant.Storyboard` and `nodetool.constant.Entity` in
      `constant.ts`; `StoryboardRef` + `Entity` in `packages/dsl/src/types.ts`;
      the `storyboard` and `entity` names in `scripts/verify-backend-bundle.mjs`.
      Test: DSL generation emits `storyboard`/`entity` typed inputs for the
      constant nodes.
- [x] **Lineage fields.** `templateId`/`recastKey` on `StoryboardDocument`
      (`packages/models/src/storyboard.ts`, `api-schemas/storyboards.ts`),
      `templateId` on `ScriptDocument` and `TimelineSequence`, `source` on
      `EntityMarker` (`creative.ts` zod + reader). Tests: old fixtures parse
      unchanged; the fields round-trip.
- [x] **`entityFromAsset` to models.** Move to `packages/models/src/entity.ts`;
      the agent capability imports it. No behaviour change; existing
      `capabilities-entities` tests stay green.
- [x] **Model interfaces.** `getStoryboard`/`createStoryboard`/`updateStoryboard`,
      `listEntities`/`getEntity`/`upsertEntity`, `listGameTemplates` on
      `ProcessingContextModelInterfaces` (`packages/runtime/src/context.ts`),
      forwarders on the context, implementations in
      `packages/websocket/src/session/model-interfaces.ts` and the CLI context
      builder. `upsertEntity` matches `source.key`, then (project, kind, name).
      Tests: ownership refusal, upsert returns the same id twice.
- [x] **`resolveEntities`.** `packages/runtime/src/entities.ts`: fill an
      entity value from the library when `descriptor` is empty and `getEntity`
      is wired; pass through otherwise. Unit test both branches.
- [x] **`nodetool.entity.*`.** `LoadEntity`, `ListEntities`, `CreateEntity` in
      `packages/core-nodes/src/nodes/entity.ts` per design §4.1. Node tests
      against an in-memory context.
- [x] **`list[entity]` on generators.** Retype `entities` on
      `nodetool.image.TextToImage`, `nodetool.video.ImageToVideo`,
      `nodetool.video.TextToVideo`, `nodetool.creative.ApplyEntities`; call
      `resolveEntities` before `injectEntities`. Test: a saved graph carrying
      the old `list[dict]` value still runs.
- [x] **Web pickers.** `StoryboardProperty` (over `DocumentPickerProperty`,
      new `useStoryboards` hook if none) and `EntityProperty` (reusing
      `EntityAssetPickerDialog`) in `web/src/components/properties/`;
      `PropertyInput.resolver.tsx` cases; `data_types.ts` entries. Jest:
      picker renders, selection writes the ref shape.

## Phase 2 — `packages/storyboard` and the storyboard nodes

- [x] **Package scaffold.** `packages/storyboard` with `AGENTS.md` +
      `CLAUDE.md`, an entry in `packages/AGENTS.md`, workspace + turbo wiring,
      dependency order `protocol → timeline → storyboard`. `npm run
      check:agents-docs` green.
- [x] **`recastStoryboard`.** Per design §3.1 with
      the fixture suite: explicit `replaces`, single-of-kind, ambiguous kind
      appends, whole-word rename (`Nova`/`Novak` case), explicit `entity_ids`
      rewrite, hash-based invalidation keeping product-free shots, lineage
      stamping, `recastKey` stable under cast order and different for the
      swapped assignment, re-derive over `existing` (edited template action
      invalidates one shot, renamed destination entity under the same id
      invalidates only the shots naming it, added shot appears, dropped shot
      reported).
- [x] **`planShotRenders` + `renderShots`.** Lift the plan and the IO from
      `packages/agents/src/capabilities/storyboards.ts`; the capability's
      `render_storyboard_stills`/`render_storyboard_clips`/`filterStale` call
      the package. Test asserting `filterStale` and `plan.fresh` agree on the
      capability's fixtures; storyboard tool-loop eval unchanged.
- [x] **`nodetool.storyboard.*`.** `LoadStoryboard`, `StoryboardShots`,
      `RecastStoryboard`, `RenderStills`, `RenderClips`, `AssembleTimeline` in
      `packages/video-nodes/src/nodes/storyboard.ts` per design §4.2, tagged
      server. Node tests: `reuse_existing` returns the prior copy,
      `only_stale` skips fresh shots, `require_keyframe` skips, the write
      contract (picker ref refused on first run and for a derived board,
      `allow_writes` admits, derived refs carry `writable`),
      `AssembleTimeline` clones the template cut for a copy and keeps its
      foreign clips, takes the linked path when `script_id` is set, and
      writes `timeline_id`.
- [x] **Web lineage chip.** "Recast from <template>" in the storyboard header
      when `templateId` is set, linking to the source board.

## Phase 3 — Script and timeline derivations

- [x] **`fillScript`.** `packages/protocol/src/script-fill.ts`, tests for
      filled/unresolved reporting and take retention.
- [x] **`nodetool.script.WriteScript` / `FillScript`.** In
      `packages/video-nodes/src/nodes/script.ts` per design §4.3; `WriteScript`
      maps `cast` entities to speakers (`entityId`, `voice.voice` from
      `voice_id`). Node tests with a stubbed provider.
- [x] **`cloneTimelineForBoard`, `fillTimelineText`, `retargetSequence`.**
      In `packages/timeline` per design §3.2; fixtures with a text clip, a
      music bed on a foreign track, a keyframed transform, and the validator
      run on every output. Clone fixture: owned clips re-stamped and cleared,
      foreign clips and tracks byte-identical.
- [x] **`nodetool.timeline.FillTimelineText` / `RetargetTimeline`.** Per design
      §4.4; both create a new sequence with `templateId`.

## Phase 4 — Game nodes

- [x] **`slotPrompt`.** `packages/protocol/src/game-slot-prompt.ts`; tests per
      slot kind asserting sizes and that `checker` matches each
      `nodetool.game.*` checker's prop names.
- [x] **`packages/game-nodes`.** `LoadGameTemplate`, `SlotPrompt`,
      `ExportGodotProject` per design §4.5, with `AGENTS.md`/`CLAUDE.md` and
      the `packages/AGENTS.md` entry; `base-nodes` re-exports. Export test
      against the platformer golden fixture in `packages/godot`.
- [x] **Checker `slot` input.** `SpriteSheet`, `Tileset`, `SeamlessImage`,
      `SoundEffect`, `MusicLoop` accept `slot: game_slot` and derive their
      numeric props from it when connected. Tests: connected slot wins over
      stale hand-typed values.

## Phase 5 — Examples, harness, docs

- [x] **Example workflows.** `Per-SKU Ad Factory`, `Localized Explainer`,
      `Platformer Asset Pack`, `Three Ratios` under
      `packages/base-nodes/nodetool/examples/nodetool-base/`, models unset,
      each passing `validate_workflow` once models are stamped.
- [x] **Fake-mode fixtures.** The same graphs with `nodetool.fake.*`
      generators and `provider: fake` on the render nodes, runnable by
      `nodetool debug` with no keys, E4 included. The E1 run asserts the
      filled overlay text is on the exported sequence; the E4 run asserts
      the source cut's clip placements are unchanged on both retargets.
- [x] **Harness registry.** `graph-resources` entry in
      `packages/cli/src/harness/registry.ts` whose selfcheck runs the pure
      suites and the fake-mode debug runs; `nodetool harness audit` clean;
      `harness gate` maps diffs under `packages/storyboard/`,
      `packages/game-nodes/`, the new node files and the examples to it.
- [x] **Docs and skills.** Node table in `docs/creative-agent.md` § Graph
      templates; the new node types in `.claude/skills/video-workflow/SKILL.md`
      and `.claude/skills/godot-game/SKILL.md` (the graph path next to the
      `invoke_node` loop); `docs/harnesses.md` entry for the harness; the
      AGENTS.md harness table row. Move this design's status line to shipped
      per phase.

### Phase 5 deviations, and why

- **Models are stamped on the examples, not left unset.** `validateGraph` treats
  a `*_model` property as required, so `RenderStills`/`RenderClips` with the
  board's models and no override fail `npm run validate:examples`
  (`--warnings-as-errors`) — the shipped gate every example passes through. The
  four examples therefore carry the same model selections the rest of the
  library does. The node still prefers the board's model only when the override
  is the empty selection, which a saved example can no longer be.
- **`Per-SKU Ad Factory` runs once per SKU rather than looping a CSV.** A
  `nodetool.code.Code` node is the only way to pull a typed string out of
  `ForEachRow`'s `row` dict, and its outputs are `dynamic_outputs`, which the
  correlation analyzer never gives a scope — every downstream node then reads
  "multiple values at empty scope; only the last is kept" and the fan-out
  collapses to one item. The example takes the SKU's fields as inputs instead;
  the batch driver is a webhook or a per-row call, as design §5 already allows.
- **No `Localized Explainer` fake-mode fixture.** `getScript` / `createScript` /
  `updateScript` are wired only in
  `packages/websocket/src/session/model-interfaces.ts`, not in
  `documentModelInterfaces()`, which is what the CLI installs — so every
  `nodetool.script.*` node fails under `nodetool debug` with "ProcessingContext
  model interface 'getScript' is not configured". The other three fixtures run.
- **`ExportGodotProject` is terminal in the E3 fixture.** Wiring any node
  downstream of it makes the run never complete: the export emits, the
  downstream node runs, and then the runner's promise never settles and the
  process exits 0 with no bundle.
