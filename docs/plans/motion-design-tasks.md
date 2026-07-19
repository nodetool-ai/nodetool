# Motion Design — Implementation Plan

Companion to [motion-design.md](motion-design.md) (the technical design).
Every task below is written to be executed by an agent **with no prior
conversation context**. Each task's first step is: read
`docs/plans/motion-design.md` in full — it is the contract; this file adds
sequencing, file-level pointers, and acceptance criteria.

Ground rules for every task:

- Repo root is a TypeScript monorepo; run `nvm use && npm install` if
  `node_modules` is missing (sandboxed environments: `npm install
  --ignore-scripts`, see `AGENTS.md` § Install in sandboxed environments).
- After changes: `npm run typecheck && npm run lint`, plus the package tests
  named in the task. `npm run dev:nodetool -- affected` maps changed files to
  the minimal workspaces to rebuild/test.
- `packages/timeline` is pure TypeScript (no DOM, no GPU, no store imports) —
  keep it that way.
- Web UI: primitives from `web/src/components/ui_primitives/` only, design
  tokens per `docs/DESIGN.md`. Never import raw MUI.
- Commit per task with a descriptive message; do not reformat unrelated code.

Model key (suggested per task):
- **Opus 4.8** (`claude-opus-4-8`) — design-sensitive core, rendering internals.
- **Sonnet 5** (`claude-sonnet-5`) — well-specified implementation and integration.
- **Haiku 4.5** (`claude-haiku-4-5-20251001`) — mechanical plumbing with exact specs.

Dependency graph:

```
M1: T1 ──► T2 (schema)   T1 ──► T3 (render)   T1 ──► T4 (edit ops)
    T3 + T4 ──► T5 (agent tools)
M2: T3 + T4 ──► T6 (inspector)   T3 ──► T7 (chips)   T3 + T5 ──► T8 (verify)
M3: T3 ──► T9 (text clips) ──► T10 (text agent + UI, also needs T5, T6)
```

---

## Milestone 1 — Animation engine and integration

### T1 — Animation core in `packages/timeline` · **Opus 4.8**

**Goal:** the pure animation engine: types, easings, preset catalog, compiler,
sampler, and edit-op semantics hooks. No web code.

**Read first:** `docs/plans/motion-design.md` §§ Data model, Preset catalog,
Editing semantics. Existing style references: `packages/timeline/src/types.ts`
(doc-comment conventions), `packages/timeline/src/splitClip.ts` (pure-op
shape).

**Create** `packages/timeline/src/animation/` with:

- `types.ts` — `AnimationRole`, `EasingId`, `ClipAnimation`,
  `AnimationPresetId` exactly as specified in the design doc.
- `easing.ts` — `ease(id: EasingId, t: number): number`, each easing pure,
  `t ∈ [0,1] → [0,~1]` (back/elastic may overshoot; clamp opacity at the
  *composition* site, not here).
- `presets.ts` — the v1 catalog table from the design doc (`fade`, `slide`,
  `pop`, `spin`, `pulse`, `shake`, `bounce`, `kenBurns`, `float`, `breathe`,
  `rotate`), each entry `{ id, roles, defaultDurationMs, defaultEasing,
  params: {name, default, min?, max?, options?}[], describe: string,
  curves(params, canvas): PropertyCurve[] }`. Export
  `ANIMATION_PRESETS` and `getAnimationPreset(id)`.
- `compile.ts` — `compileClipAnimations(animations, clipDurationMs, canvas)`
  → `CompiledAnimation[]` (window math per role incl. `delayMs`, clamping to
  clip duration, dropping degenerate windows, resolving normalized preset
  distances to px). `kenBurns` compiles as a full-clip one-shot with
  `holdAfter: true`, not a repeating loop.
- `sample.ts` — `IDENTITY_SAMPLE`, `sampleAnimations(compiled, localMs)`
  implementing the fold rules (add offsets/rotation, multiply scale/opacity;
  hold-before for `in`, hold-after for `out`, modulo for `loop`). Also export
  `hasActiveAnimationWindow(compiled, localMs): boolean`.
- `index.ts` barrel; re-export everything from `packages/timeline/src/index.ts`.

**Modify:**

- `packages/timeline/src/types.ts` — add `animations?: ClipAnimation[]` to
  `TimelineClip` (after `transitionIn`), doc comment included.
- `packages/timeline/src/splitClip.ts` — left half keeps `in`, right keeps
  `out`, `emphasis`/`loop` copied to both, right-half ids regenerated. Follow
  how the file already handles `caption`/`paragraphId` for split-field
  precedent.
- `packages/timeline/src/defaults.ts` — no new factory needed; verify
  `makeClip` output stays valid with the field absent.

**Tests** (`packages/timeline/src/animation/__tests__/`, Vitest — mirror the
package's existing test setup; if the package has no `__tests__` yet, add the
standard Vitest config used by sibling packages):

- easings: endpoints 0→0, 1→1; easeOut monotonic; back overshoots.
- window math per role, incl. `out` measured from clip end, delays, clamping
  when duration > clip length.
- sampler: identity outside windows, hold semantics, fold of `in`+`loop`
  concurrently, loop wraparound continuity (start==end value for every
  compiled animation with `loop: true`), delayed `fade`-in holds opacity 0
  during delay, folded opacity clamped to [0,1] under `easeOutBack`.
- split semantics as above.
- determinism: same inputs → deeply equal compiled output.

**Acceptance:** `npm run test --workspace=packages/timeline` green;
`npm run typecheck && npm run lint` green; no imports from web/ or DOM types.

---

### T2 — Protocol schema + persistence round-trip · **Haiku 4.5**

**Goal:** `animations` survives save/load; older documents load unchanged.

**Depends on:** T1 merged (types exist).

**Context:** `TimelineDocument` persists as a JSON blob (no DB migration), but
the wire schema strips unknown fields on PATCH — see the comment on
`storyboardBoardId` in `packages/timeline/src/types.ts`.

**Modify:**

- `packages/protocol/src/api-schemas/timeline.ts` — add to the clip schema:
  `animations: z.array(clipAnimationSchema).optional()` where
  `clipAnimationSchema = z.object({ id: z.string(), role: z.enum(["in","out","emphasis","loop"]), preset: z.string(), durationMs: z.number(), delayMs: z.number().optional(), easing: z.string().optional(), enabled: z.boolean().optional(), params: z.record(z.union([z.number(), z.string(), z.boolean()])).optional() })`.
  `preset`/`easing` are plain strings on the wire by design (forward compat);
  the compiler skips unknown presets.
- Check `web/src/hooks/timeline/timelineDocumentPayload.ts` and
  `web/src/hooks/timeline/useLoadTimelineIntoStore.ts`: if they pass clips
  through wholesale, no change; if they enumerate fields, add `animations`.

**Tests:** protocol package round-trip test — a clip with two animations
parses through the zod schema unchanged; a clip without the field parses; an
animation with an unknown `preset` string parses (validation is not the
schema's job).

**Acceptance:** `npm run test --workspace=packages/protocol` green; save →
reload in the web store preserves `animations` (covered by the payload check
above); typecheck/lint green.

---

### T3 — Preview + export rendering integration · **Opus 4.8**

**Goal:** animated transform/opacity visible in the live preview and identical
in the MP4 export.

**Depends on:** T1.

**Read first:** design doc § Rendering integration;
`web/src/components/timeline/preview/sceneModel.ts` (whole file — note the
change-horizon contract on `computeActiveLayersWithHorizon`, which must NOT
change);
`web/src/components/timeline/preview/PreviewCompositor.tsx`;
`web/src/components/timeline/render/TimelineRenderer.ts`;
`web/src/components/timeline/preview/gpu/transform.ts` (position = canvas px
from center, scale multiplies contain-fit, rotation radians).

**Create in `sceneModel.ts`** (keep it pure):

- `resolveAnimatedLayerProps(layer, currentTimeMs, canvas, cache)` →
  `{ transform?: ClipTransform; opacity: number }` per the design doc's
  composition table. Identity fast-path: no enabled animations → return the
  layer's existing values without allocating.
- `hasActiveAnimation(layers, currentTimeMs, cache): boolean`.
- An `AnimationCompileCache` (Map keyed by clip id, invalidated when the
  `animations` array reference changes) so compilation never runs in the rAF
  loop.

**Wire up:**

- `PreviewCompositor.tsx`: where each `ActiveLayer`'s `transform`/`opacity`
  feed the GPU layer list, route through `resolveAnimatedLayerProps`. Then fix
  the redraw condition: the compositor skips redraws while the cached layer
  set is valid (`nextChangeMs` horizon) and nothing else changed. With
  animations, any tick where the playhead time changed and
  `hasActiveAnimation(...)` is true must redraw even though the layer set is
  cached — otherwise motion freezes mid-clip. A paused playhead needs only the
  one draw after the last seek: samples are pure functions of time, so a
  static frame stays correct.
- `render/TimelineRenderer.ts`: apply the same resolver at each stepped frame.
  The cache can live for the whole render.
- Caption layers get the same resolution (they already carry `transform`).

**Tests** (Jest, `web/src/components/timeline/preview/__tests__/`):

- composition: static transform `{position:{x:100,y:0}}` + `slide` in from left
  at window midpoint → hand-computed expected transform/opacity.
- parity: for a seeded clip set, `resolveAnimatedLayerProps` output at
  t = {window start, mid, end, past-end} is identical when called the way the
  compositor calls it and the way the renderer calls it.
- horizon: `nextChangeMs` from `computeActiveLayersWithHorizon` is identical
  with and without animations on a clip — animations must never shrink the
  horizon; callers keep reusing cached layers and re-resolve properties per
  frame instead.

**Acceptance:** `cd web && npm test -- --testPathPattern=preview` green; manual
check via the debug harness or `cd web && npm start` optional; typecheck/lint
green. Do not modify `computeActiveLayersWithHorizon`'s signature or horizon
semantics.

---

### T4 — Store patch action + trim/duplicate semantics · **Sonnet 5**

**Goal:** clip animation edits flow through the Zustand store with undo/redo,
and duplicate/trim behave per the design doc.

**Depends on:** T1.

**Read first:** design doc § Editing semantics;
`web/src/stores/timeline/TimelineStore.ts` (find `patchClip(clipId, patch)`
around the store actions; note the temporal undo middleware and pure-reducer
style); `packages/timeline/src/trimClip.ts`.

**Do:**

- Add a store action `setClipAnimations(clipId, animations: ClipAnimation[])`
  (thin wrapper over `patchClip` is fine if `patchClip` already handles
  arbitrary fields — verify it does not shallow-merge arrays incorrectly).
- `duplicateClip` path (find the existing duplicate logic — store or
  `useTimelineAgentBridge.ts`): copy `animations` with fresh `id`s
  (`crypto.randomUUID()`).
- Trim: confirm no data rewrite is needed (compile-time clamping from T1
  covers it) and add a comment where `trimClip` is called noting that.
- Verify split flows through the T1 `splitClip` change (store calls the pure
  op — confirm, don't reimplement).

**Tests:** store-level Jest test: set animations → undo → redo; split a clip
with in+out+loop and assert the halves' animation roles; duplicate regenerates
ids.

**Acceptance:** `cd web && npm test -- --testPathPattern=timeline` green;
typecheck/lint green.

---

### T5 — Agent tools · **Sonnet 5**

**Goal:** an agent can discover the motion vocabulary, apply animations, and
inspect them — the primary authoring surface.

**Depends on:** T1, T3 (so results are visible), T4 (store action).

**Read first:** design doc § Agent surface;
`web/src/lib/tools/builtin/timeline.ts` (register pattern, `targetParam`,
error convention);
`web/src/components/timeline/timelineAgentBridge.ts` (`TimelineAgentHandler`);
`web/src/hooks/timeline/useTimelineAgentBridge.ts` (handler implementation —
see `setClipParams` at ~line 377 for the patch pattern).

**Do:**

- Extend `TimelineAgentHandler` with
  `setClipAnimations(target, animations: ClipAnimationInput[], mode: "add" | "replace")`
  and `clearClipAnimations(target, role?)`; implement in
  `useTimelineAgentBridge.ts` (resolve target by id/name/"selected" like the
  existing methods; fill defaults from the preset catalog; validate
  preset/role and throw descriptive errors that include the valid options).
- Register in `web/src/lib/tools/builtin/timeline.ts`:
  - `ui_timeline_animate_clip` — zod params
    `{ target, mode: z.enum(["add","replace"]).optional(), animations: z.array(z.object({ role, preset, durationMs?, delayMs?, easing?, params? })) }`.
    Description must include the compact vocabulary summary (preset names by
    role, that durations are ms, and the recommended loop: *get_state →
    animate → get_clip_frames at window boundaries → adjust*).
  - `ui_timeline_clear_animations` — `{ target, role? }`.
  - `ui_timeline_list_animation_presets` — no params; returns
    `ANIMATION_PRESETS` mapped to `{ id, roles, params, defaults, describe }`.
- Include `animations` in `getSnapshot()` clip entries (find the snapshot
  builder in `useTimelineAgentBridge.ts`).

**Tests:** Jest tests beside existing frontend-tool tests (find the pattern
under `web/src/lib/tools/`): registering is side-effectful on import, so test
through `FrontendToolRegistry.call` with a stubbed handler — animate applies
defaults, an unknown preset produces an error whose message lists the valid
preset ids, clear with role filter keeps other roles.

**Acceptance:** `cd web && npm test -- --testPathPattern=tools` green;
typecheck/lint green; tool count in the manifest grows by 3.

---

## Milestone 2 — Manual UI + verification

### T6 — Inspector "Animate" section · **Sonnet 5**

**Depends on:** T3, T4.

**Read first:** design doc § Manual UI;
`web/src/components/timeline/Inspector/ClipAdjustments.tsx` (section pattern,
fold behavior via `usePersistedFold.ts`),
`InspectorPrimitives.tsx` (labeled rows, sliders, selects),
`web/src/components/ui_primitives/STRATEGY.md`, `docs/DESIGN.md`.

**Do:** an "Animate" section in the clip inspector: list current animations
grouped by role; add-animation flow (role → preset filtered by
`roles` → defaults applied); per-animation controls: duration (ms), delay,
easing select, preset params (number params as sliders with catalog min/max,
option params as selects); enable toggle; delete. All edits go through the T4 store
action (single `patchClip` per change so undo granularity is per-edit).

**Constraints:** `ui_primitives` only; `SPACING`/`TYPOGRAPHY`/`MOTION` tokens;
no hardcoded px/transition strings; selection comes from the existing
inspector wiring (`TimelineInspector.tsx`).

**Tests:** RTL: renders animations from a stub clip; adding a `pop` in-animation
dispatches the expected store patch; slider change patches `params`.

**Acceptance:** `cd web && npm test -- --testPathPattern=Inspector` green;
typecheck/lint green.

---

### T7 — Clip animation chips in track lanes · **Haiku 4.5**

**Depends on:** T3.

**Read first:** `web/src/components/timeline/Tracks/Clip.tsx` (how fade
handles / status badges are drawn at clip edges, zoom-dependent widths).

**Do:** read-only affordances on clips that have animations: a left wedge
spanning the `in` window's width at current zoom, a right wedge for `out`, a
small loop glyph (⟳ icon from the project's icon set) when a
`loop`/`emphasis` animation exists. Clicking them selects the clip (existing
click path). Keep it cheap: pure derivation from `clip.animations`, no new
store state; hide wedges below a minimum px width (~6 px) to avoid clutter at
low zoom.

**Acceptance:** visual check in `cd web && npm start`; no new lint/type
errors; existing `Tracks` tests still green.

---

### T8 — End-to-end verification pass · **Sonnet 5**

**Depends on:** T3, T5.

**Goal:** prove the loop the feature exists for: an agent animates a clip and
the export contains the motion.

**Do:**

- Add a seeded visual test to the existing web visual/debug-harness suite
  (`web/tests/`, see `yts806379-everything-claude-code-e2e-testing` patterns in
  repo tests): build a two-clip sequence in code (image clip + `slide` in +
  `kenBurns` loop; second clip `pop` in with delay), render frames at fixed
  timestamps through the real compositor, snapshot-compare.
- Export parity: run `renderTimeline` for the same sequence at a low fps
  (e.g. 5) for 3 s
  and assert frame N's decoded pixels match the preview compositor's output
  within tolerance (reuse whatever the existing export tests do — locate them
  under `web/src/components/timeline/render/`).
- Update `docs/video-editor.md` (and `docs/timeline-editor-prd.md` if it lists
  capabilities) with a short "Animations" section; follow
  `docs/WRITING_STYLE.md`.

**Acceptance:** new tests green in `cd web && npm test`; docs updated; full
`npm run check` green at repo root.

---

## Milestone 3 — Text clips (phase 2, separately mergeable)

### T9 — `text` clip type + rasterized rendering · **Opus 4.8**

**Depends on:** T3.

**Read first:** design doc § Phase 2;
`web/src/components/timeline/preview/captionRender.ts` (existing text
rasterization — reuse its font/scale handling);
`web/src/components/timeline/preview/gpu/source.ts` (how bitmaps become GPU
sources); `packages/timeline/src/types.ts`.

**Do:**

- `packages/timeline`: extend `TimelineClip.mediaType` union with `"text"`;
  add `textStyle?: ClipTextStyle` (`{ text: string; fontFamily?: string;
  fontSizePx: number; fontWeight?: number; color: string; align?:
  "left"|"center"|"right"; maxWidthFrac?: number }`); protocol schema field
  (same pattern as T2); `makeClip` support.
- Scene model: a text clip contributes a layer with `kind: "image"` semantics
  but sourced from a rasterized bitmap — introduce `kind: "text"` on
  `ActiveLayer` and teach both compositors (`gpu/compositor.ts`,
  `gpu/canvas2dCompositor.ts`) and the renderer to draw it: rasterize
  `textStyle` to an offscreen canvas at sequence resolution × devicePixelRatio,
  cache by hash of `textStyle`, upload like any image source.
- Text clips are `sourceType: "imported"` with `status: "generated"`-equivalent
  drawability — pick the minimal status handling that makes
  `effectiveAssetId`-gated paths treat text as always drawable (they have no
  asset id; adjust `computeActiveLayers`' caption-only guard accordingly).
- Animations apply unchanged via `resolveAnimatedLayerProps`.

**Tests:** scene-model unit tests (text layer present, no asset id required);
rasterizer cache hit test; visual snapshot of a styled text frame.

**Acceptance:** a text clip with `pop` in-animation renders in preview and
export; `npm run check` green.

---

### T10 — Text clip authoring: agent tool + inspector · **Sonnet 5**

**Depends on:** T9, T5, T6.

**Do:**

- Handler + tool `ui_timeline_add_text_clip` — `{ text, trackId?, startMs?,
  durationMs?, style? }`, defaulting onto an overlay track (create one if none,
  same fallback logic as `generateClip`'s track selection in
  `useTimelineAgentBridge.ts`), default duration 3000 ms. Extend
  `ui_timeline_set_clip_params` (or the snapshot + a `textStyle` patch on
  `setClipParams`) so the agent can restyle existing text clips.
- Inspector: text section (content textarea, font size, weight, color, align)
  for `mediaType === "text"` clips, same primitives/tokens rules as T6.
- `AddClipMenu.tsx`: manual "Text" entry.

**Tests:** tool test (adds clip on overlay track with defaults); RTL inspector
test (edit patches `textStyle`).

**Acceptance:** agent flow works end-to-end: `ui_timeline_add_text_clip` →
`ui_timeline_animate_clip` (pop in, float loop) → `ui_timeline_get_clip_frames`
shows animated text; `npm run check` green.

---

## Sequencing summary

| Order | Task | Model | Parallelizable with |
|---|---|---|---|
| 1 | T1 animation core | Opus 4.8 | — |
| 2 | T2 protocol schema | Haiku 4.5 | T3, T4 |
| 2 | T3 render integration | Opus 4.8 | T2, T4 |
| 2 | T4 store + edit ops | Sonnet 5 | T2, T3 |
| 3 | T5 agent tools | Sonnet 5 | — |
| 4 | T6 inspector | Sonnet 5 | T7 |
| 4 | T7 clip chips | Haiku 4.5 | T6 |
| 5 | T8 verification | Sonnet 5 | — |
| 6 | T9 text clips | Opus 4.8 | — |
| 7 | T10 text authoring | Sonnet 5 | — |

Ship gate for Milestone 1+2: T8 green. Text (M3) is separately mergeable.
