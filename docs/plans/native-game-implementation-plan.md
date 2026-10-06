# Native game engine and editor: parallel implementation plan

This plan turns [the gap analysis](native-game-gap-analysis.md) (G1 to G72) and the open findings in [the audit](native-game-editor-audit.md) (F4 to F30) into work for autonomous coding agents running in parallel. Each agent takes one workstream and works through its task cards in order.

The plan was written against `main` at `b1337258` (2026-10-06). File and line references are starting points. Re-check them before editing.

## 1. How to use this plan

1. Run Wave 0 first. Its tasks create the extension seams and the ownership boundaries that make parallel work safe. Wave 0 has three streams that can themselves run in parallel (K, W and B).
2. After Wave 0 is merged, start up to 12 workstreams at once. Each agent gets the launch prompt in [section 9](#9-launch-prompt-for-a-workstream-agent) with its stream letter filled in.
3. An agent works through its stream's task cards top to bottom. A card may start only when every card in its **Depends on** line is merged to `main`.
4. One task card is one pull request. Large cards list sub-PRs explicitly.
5. When a card needs a file owned by another stream, follow the shared-file protocol in [section 4](#4-ownership-and-the-shared-file-protocol). Never edit another stream's owned files directly.

## 2. Rules every task must follow

These come from the repository's `AGENTS.md`, `docs/DEVELOPMENT_STANDARDS.md` and the existing game design documents in `docs/plans/` (`builtin-game-engine-design.md`, `native-game-3d-upgrade.md`, `native-game-editor.md`, `native-game-artistic-roadmap.md`, `retained-game-authoring.md`). Read those before the first task.

### 2.1 Environment

- Run `scripts/setup-agent-env.sh`, then `npm run build:packages`, at the start of every session.
- In the cloud container, a plain `npm install` fails because the lockfile pins `xlsx` to `cdn.sheetjs.com`. Swap `xlsx` to its npm-registry version, install, then restore `package.json` and `package-lock.json` before committing. Never commit the swap.
- The runtime and renderer suites need `ffmpeg` and a Vulkan ICD (`mesa-vulkan-drivers`). Install them before suite-wide runs. Do not skip a test that reports "No WebGPU adapter available".
- Headless Chromium 3D capture can fail in the cloud container. If a capture test cannot run there, say so in the PR and point to the CI run that executed it. Never mark it skipped.

### 2.2 Definition of done for every card

A card is done only when all of these hold:

1. The four mandatory checks pass:
   ```bash
   npm run test:affected
   npm run typecheck
   npm run lint
   npm run dev:nodetool -- harness gate --base origin/main
   ```
2. New behavior has tests in the package's existing test directory. Bug fixes ship the reproduction test.
3. Determinism holds (section 2.3).
4. Schema changes follow section 2.4.
5. The agent can author the feature (section 2.5).
6. The `native-game` system skill section owned by the stream is updated when authoring changes (`packages/system-skills/native-game/SKILL.md`).
7. UI follows `docs/DESIGN.md` and `web/src/components/ui_primitives/STRATEGY.md`: primitives only, no raw MUI outside `ui_primitives/` and `editor_ui/`, design tokens only, font weights 400, 500 or 600.
8. Performance-sensitive cards record before and after numbers from the benchmark harness (card B1) in the PR body.
9. The PR body uses the repository template if one exists. It names the gap and finding IDs in the title, for example `game: image-based lighting and sky (G2)`.

### 2.3 Determinism contract

The engine is deterministic: 60 Hz fixed tick, seeded RNG, snapshots, replay (`nodetool game simulate --verify-replay`). Every change must keep that.

- **Simulation state** is anything that changes events, scores, positions, physics or script results. It lives in the snapshot and must be reproducible from the document, the seed and the input frames.
- **Presentation state** includes particles, audio mixing, post-processing, IK, cosmetic animation blending and camera smoothing. It must never feed back into simulation. It may read simulation state.
- A change to simulation behavior for an existing document requires either a new engine contract version or proof that the existing fixtures produce identical snapshots and event streams (`packages/game-runtime/tests/fixtures/engine1-*.json`, `engine1-characterization.test.ts`, `session3d.test.ts`).
- A change to Rapier usage that alters stepping must update `GAME_PHYSICS_BUILD_3D` in `packages/game-runtime/src/spatial3d/world.ts` so old 3D snapshots are rejected rather than silently diverging.

### 2.4 Schema change rules

- Schemas live in `packages/protocol/src/game.ts` (2D, schema 1–2, engine "1") and `game3d.ts` (3D, schema 3, engine "2"). After card W1 they are split into per-component modules (section 4).
- New fields on schema 3 are optional, or have defaults that reproduce today's behavior exactly. Existing stored documents must parse and play identically.
- `native-game-3d-upgrade.md` (D1) requires that future 2D changes allocate a deliberate schema version. Any 2D change that alters simulation (card P1) uses a new 2D schema version and engine version. It does not reuse 1, 2 or 3.
- Every new field gets: a Zod definition with bounds, validation in `validate.ts` or `validate3d.ts` when it references ids or assets, document ops coverage in `document-ops.ts` or `document-ops3d.ts`, and a diff and merge unit (`web/src/stores/game/`) when it is not covered by the generic entity diff.
- Scripts are typed from the schemas (`script-types.ts`, `script-types3d.ts`). New script commands update those declarations, which feed Monaco and the agent.

### 2.5 Agent and harness reachability

NodeTool follows harness-first engineering (`docs/HARNESS_FIRST.md`). Every feature must be drivable without the editor UI.

- The in-product agent edits games through the game capability in `packages/agents/src/capabilities/game.ts` and the document ops. Confirm the new field or command is reachable through them. Add a case to `packages/agents/src/evals/surfaces/game.ts` when the feature changes what an agent can author.
- `nodetool game validate | simulate | capture | build` (`packages/cli/src/commands/game.ts`) must accept documents that use the feature. Add a simulate or capture fixture.
- Selfchecks are wired through `packages/cli/src/harness/registry.ts` (`game-flow` entry). Add new test filters there when a new test file is not already selected.

### 2.6 Dependencies

New npm dependencies need a short justification in the PR (size, license, maintenance, WASM or not) per `docs/DEVELOPMENT_STANDARDS.md#21-dependencies--versions`. Pin exact versions for anything that affects simulation, as Rapier is pinned today. Already in the repository and preferred: `three` 0.185.1, `@dimforge/rapier3d-compat` 0.19.3, `@gltf-transform/core` and `@gltf-transform/functions`, `meshoptimizer`, `@xyflow/react`.

## 3. Parallelisation model

### 3.1 Why the foundation wave exists

A few files are touched by almost every feature:

| Hotspot | Size | Touched by |
|---|---|---|
| `packages/protocol/src/game3d.ts`, `game.ts` | 301, 263 lines | every engine feature |
| `packages/game-runtime/src/session3d.ts`, `session.ts` | 475, 1111 lines | physics, scripting, animation, audio events, input |
| `packages/game-renderer/src/renderer3d/index.ts` | 622 lines | every 3D rendering feature, HUD, particles |
| `packages/game-renderer/src/webgpu.ts` | 844 lines | 2D rendering, particles, HUD |
| `web/src/components/game/GameEditor.tsx`, `GameEditor3D.tsx` | 491, 236 lines | every editor feature |
| `packages/system-skills/native-game/SKILL.md` | 323 lines | every authoring change |

If twelve agents edit these at once, most PRs conflict. Wave 0 splits each hotspot into modules with a registration point. After that, a feature adds new files plus one registration line. One-line conflicts in a registration list are trivial to resolve.

### 3.2 Waves

| Wave | Streams | Gate to start |
|---|---|---|
| 0 | K (stabilisation), W (seams), B (baselines) | none |
| 1 | R, V, P, A, N, S, U, E, C, D (first cards), M (milestone games) | W1–W5 merged, K1–K3 merged |
| 2 | Same streams, later cards, plus G (navigation) | per-card dependencies |
| 3 | R8 (WebGPU 3D migration) and cards that depend on it | R1–R7 and V3 merged, renderer freeze declared (section 3.4) |

Waves are not global barriers after Wave 0. A stream moves to its next card as soon as that card's dependencies are merged.

### 3.3 Stream overview

| Stream | Scope | Gaps and findings | Cards |
|---|---|---|---|
| K | Stabilisation of existing editor and API | F4–F29 | K1–K7 |
| W | Foundation seams | G61 (shell), G64 (command bus) | W1–W6 |
| B | Benchmarks, golden images, showcase fixtures | G38 (measurement), G72 | B1–B3 |
| R | 3D rendering | G1–G6, G8, G9, G41, G58, G65, G70 | R1–R11 |
| V | 2D rendering and VFX | G10–G12, G37 | V1–V8 |
| P | Physics | G13–G18, G66, G68, G69 | P1–P9 |
| A | Audio | G19–G21 | A1–A4 |
| N | Animation | G22–G25, G57 | N1–N7 |
| S | Scripting and gameplay runtime | G26–G28, G30–G32, G67, G71 | S1–S8 |
| U | Input and game UI | G33–G35 | U1–U4 |
| G | Navigation and AI | G29 | G1n–G4n |
| E | Editor UX and tooling | G45, G46, G48, G49, G51–G55, G60, G62, G63 | E1–E11 |
| C | Content pipeline and assets | G7, G36, G40, G47, G50, G56, G59 | C1–C7 |
| D | Performance architecture and delivery | G38, G39, G42, G43 | D1–D5 |
| M | Milestone games and integration | acceptance across streams | M1–M3 |

Navigation cards use the suffix `n` (G1n to G4n) so they are not confused with gap IDs.

### 3.4 Renderer freeze for R8

R8 moves the 3D renderer from `WebGLRenderer` to `WebGPURenderer`. While R8 is open, streams R, V and U must not merge changes to `packages/game-renderer/src/renderer3d/`. R8's agent announces the freeze by opening a draft PR titled `game: renderer freeze for WebGPU migration (R8)` and lifts it on merge. Other streams continue on non-renderer cards during the freeze.

## 4. Ownership and the shared-file protocol

### 4.1 Ownership map after Wave 0

| Path | Owner |
|---|---|
| `packages/protocol/src/game3d/components/<component>.ts` (created by W1) | The stream that owns the component (table 4.2) |
| `packages/protocol/src/game3d/index.ts`, `game2d/index.ts` (registration lists) | W, then shared by registration line |
| `packages/game-runtime/src/systems/<system>.ts` (created by W2) | Stream that owns the system |
| `packages/game-runtime/src/session3d.ts`, `session.ts` after W2 | W during Wave 0, then S. Other streams register systems and do not edit the core loop |
| `packages/game-runtime/src/spatial3d/` | P |
| `packages/game-runtime/src/scripts*.ts`, `script-types*.ts` | S |
| `packages/game-runtime/src/physics.ts` and 2D collision code in `session.ts` | P |
| `packages/game-renderer/src/renderer3d/passes/`, `environment/`, `materials/`, `shadows/` (created by W3) | R |
| `packages/game-renderer/src/renderer3d/assets/` (loaders, created by W3) | C |
| `packages/game-renderer/src/renderer3d/animation/` (created by W3) | N |
| `packages/game-renderer/src/renderer3d/hud/` and `src/ui/` | U |
| `packages/game-renderer/src/webgpu/` passes (created by W3 from `webgpu.ts`) | V, except `webgpu/hud.ts` owned by U |
| `packages/game-renderer/src/particles/` | V |
| `packages/game-renderer/src/audio/` (created by W3 from `audio.ts`) | A |
| `packages/game-renderer/src/input*.ts`, `touch-controls.ts` | U |
| `packages/game-renderer/src/build*.ts`, `standalone-player*.ts` | D |
| `packages/game-renderer/src/renderer3d/preparation.ts`, `packages/game-nodes/` | C |
| `web/src/components/game/shell/` (created by W4) | E |
| `web/src/components/game/panels/<panel>/` | Stream that owns the panel |
| `web/src/components/game/viewport3d/`, `viewport2d/` (created by W4) | E |
| `web/src/components/game/inspector/editors/<component>.tsx` | Stream that owns the component |
| `web/src/stores/game/` | K during Wave 0, then E |
| `web/src/components/game/useGamePlaySession*.ts` | K during Wave 0, then S |
| `packages/cli/src/commands/game.ts` | D, with other streams adding options through the shared-file protocol |
| `packages/agents/src/capabilities/game.ts`, `evals/surfaces/game.ts` | Shared by append (protocol below) |
| `packages/system-skills/native-game/SKILL.md` | One section per stream, created by W6 |

### 4.2 Component ownership

| Component or field | Owner |
|---|---|
| `primitive`, `model.material`, `gameMaterial3D`, `gameEnvironment3D`, `light3d`, `camera3d` rendering fields, render quality settings | R |
| `particles` (new), 2D `sprite` rendering fields, `light2d`, `renderEffects` | V |
| `body2d`, `collider2d`, `tilemap` solidity, `body3d`, `collider3d`, `character3d`, `joints` (new), `physicsMaterials` (new), `collisionMatrix` (new), `simulation` settings (new) | P |
| `audioSource`, `music`, `audio` settings (new) | A |
| `animator`, `animator3d`, `animationGraphs` (new), `visualAnimation`, `tracks3d` (new) | N |
| `behaviors` (script and built-in), `tags` and `props` (new), save-data settings | S |
| `inputBindings` (new), `ui` (new HUD tree), `strings` (new) | U |
| `navigation` (new), `navAgent` (new) | G |
| `prefabs`, asset bindings, import settings | C |

### 4.3 Shared-file protocol

When a card needs a change in a file it does not own:

1. If the change is a registration line in a list created for that purpose, make it directly. Keep it to that line.
2. Otherwise, write the smallest interface the owner should expose, as a TypeScript signature plus a test, in the PR description of a request PR titled `game: interface request for <stream> (<card>)`. Open it against the owner's files with only that interface and a test. The owning stream's agent reviews and merges it ahead of its own queue.
3. While waiting, continue with work that does not need the interface. Never copy the owner's code into your own files as a workaround.
4. Append-only shared files (`capabilities/game.ts` tool descriptions, `evals/surfaces/game.ts`, `harness/registry.ts` filters): add to the end of the relevant list and rebase before merge.

## 5. Wave 0: foundation

### Stream K: stabilisation

K runs first because several fixes touch files that W4 restructures.

**K1. Save path correctness (F4, F5, F8, F14).**
- Depends on: none.
- Owns: `web/src/stores/game/`, the save and merge sections of `GameEditor.tsx` and `GameEditor3D.tsx`, `packages/websocket/src/trpc/routers/games.ts` save handlers.
- Do: validate the merged document before diffing into `pendingOps`. When the server rejects with an unchanged token, drop the offending ops or reload the draft instead of resending. Make the 3D `pull()` wait for the in-flight save as 2D does. Serialise concurrent `flush()` callers. Clear "error" when a later merge or save succeeds. Keep `baseUpdatedAt` at the latest server token after accepting a conflict.
- Accept: reproduction tests for each of F4, F5, F8 and F14 in `web/src/stores/game/__tests__/` fail before and pass after. The 3D journey `web/tests/journeys/native-game3d-editor.spec.ts` passes without the model-install save conflict.

**K2. Play session reuse (F15, F16, F23, F28).**
- Depends on: none. Can run in parallel with K1. Owns `useGamePlaySession.ts`, `useGamePlaySession3D.ts`.
- Do: keep the renderer, font loader, `AudioContext` and decoded audio across edits. On document change, rebuild only the session, and reload only assets whose bindings changed. Memoise `diffGameDocuments` and `validateGame` on the document. Drop paused input. Cap the replay input history with a ring buffer and keep the replay feature working inside the cap.
- Accept: a test proves the renderer instance survives 10 edits. B1's editor benchmark (once merged) shows no "Initializing" state on edit. Play-mode React renders per second drop to the HUD's update rate.

**K3. 2D child transforms (F9) and selection operations (F10, F12).**
- Depends on: none. Owns `GameViewport.tsx`, `viewportGeometry.ts`, `GameInspector.tsx`.
- Do: convert between world and parent-local transforms at the viewport seam. Hit-testing, marquee, overlays and frame selection use world transforms. Reparenting preserves world transform. Delete, nudge and drag act on the whole selection and skip descendants of removed entities. The Parent list excludes descendants.
- Accept: the F9 reproduction (parent at x=5, child at local x=2) passes. Multi-delete of a parent and child produces a valid op list.

**K4. Publish and restore safety (F6, F7, F18, F19, F20, F25, F26, F27).**
- Depends on: K1. Owns `packages/models/src/game.ts`, `games.ts` publish and restore handlers, revisions UI.
- Do: require the draft token for restore and explicit-document publish. Make `readDraft` recover from a missing version file. Read `baseRevision` fresh at publish. Publish the validated document by digest. Wrap post-commit cleanup. Confirm before restore. Return INVALID_INPUT for validation errors. Prune orphans and old revision files.
- Accept: one test per finding.

**K5. 3D editor input and parity bugs (F11, F21, F22 partial, F24, F29).**
- Depends on: none. Owns the keyboard and status sections of `GameEditor3D.tsx`, `GameViewport3D.tsx`.
- Do: scope undo shortcuts to the viewport and hierarchy, not text fields. Clear `operationError` on success. Fix highlight. Wrap `localStorage`. Leave mouse bindings for U1, which replaces them.

**K6. Script pane draft conflict (F13) and history growth (F17).**
- Depends on: K1. F17 is solved properly by W5. K6 only caps `draftChanges` payload size and adds a limit to `saveDraft` op count.

**K7. F30 investigation.** Capture the error text of the reported crash after Stop on a container without a Vulkan ICD. Fix it or record it as not reproducible with evidence.

### Stream W: seams

W cards are pure refactors. Each must prove no behavior change: the full game selfcheck (`game-flow` in the harness registry) passes, replay fixtures are byte-identical and golden captures from B2 match.

**W1. Split protocol schemas into component modules.**
- Depends on: none.
- Do: move each 3D component schema into `packages/protocol/src/game3d/components/<name>.ts` and compose `gameEntity3D`, `gameScene3D` and `gameDocument3D` in `game3d/index.ts` from a list. Do the same for 2D under `game2d/`. Re-export everything from the existing module paths so imports keep working.
- Accept: a test serialises `z.toJSONSchema` (or the repository's existing schema-to-declaration helper) of every exported schema before and after and asserts equality. Script type declarations in `script-types*.ts` are byte-identical.

**W2. Runtime system pipeline.**
- Depends on: W1.
- Do: restructure the 3D tick in `session3d.ts` into an ordered list of systems in `packages/game-runtime/src/systems/`: input, scripts, character, physics step, contacts, gameplay rules, animation state, presentation events. Each system has `init(document, scene)`, `step(context)`, `snapshot()` and `restore()`. Add a presentation-event channel that is not part of the snapshot (consumed by particles, audio and debug draw). Record per-system CPU time in a `GameStepTimings` structure returned with each step, behind a flag so release builds pay nothing. Apply the same structure to the 2D session where it does not change ordering.
- Accept: replay and characterization fixtures are identical. A test asserts system order. Timings appear in `GameStepResult3D` when enabled.

**W3. Renderer module split.**
- Depends on: none (can run with W1).
- Do: split `renderer3d/index.ts` into `scene-sync.ts`, `materials/`, `lights/`, `environment/`, `shadows/`, `animation/`, `assets/` (GLTF loading and caches), `hud/` and a `RenderPipeline3D` with an ordered pass list (scene pass, overlay pass, HUD pass). Passes register by name and order. Split `webgpu.ts` into `webgpu/sprites.ts`, `webgpu/lighting.ts`, `webgpu/effects.ts`, `webgpu/hud.ts` and a pass list with the same idea. Split `audio.ts` into `audio/player.ts` and `audio/voices.ts`.
- Accept: golden captures from B2 match pixel-for-pixel on the same backend. `GameRendererStats3D` output is unchanged.

**W4. Unified editor shell and panel registry (G61 foundation).**
- Depends on: K1, K2, K3, K5.
- Do: create `web/src/components/game/shell/GameEditorShell.tsx` used by both 2D and 3D. It owns the toolbar, the left, right and bottom dock regions, the status bar and the keyboard scope. Panels register in `shell/panelRegistry.ts` with id, title, icon, dimension support (2D, 3D, both) and default region. Move hierarchy, inspector, script pane, changes, revisions, agent panel and viewport into `panels/` and `viewport2d/` and `viewport3d/`. Port the 2D-only features listed in the audit's 3D gap list where the port is mechanical (revisions panel, script error tools). Leave the rest to E cards.
- Accept: both editors render through the shell. Existing journeys pass (`native-game-editor.spec.ts`, `native-game3d-editor.spec.ts`, `native-game-audio.spec.ts`). A test registers a dummy panel and finds it in the layout.

**W5. Labelled command bus for undo and redo (G64, F17).**
- Depends on: W4.
- Do: replace the anonymous undo stack in `GameDraftStore` with commands `{ label, ops, inverseOps, mergeKey? }`. Consecutive commands with the same `mergeKey` within one gesture coalesce (a gizmo drag is one command). 3D edits produce op-level commands, not `set_document`. Expose a history list for E cards.
- Accept: dragging an entity and undoing once restores it. Undo labels read "Move Player", "Change Light Intensity". A 3D edit produces ops other than `set_document` (fixes F17's growth).

**W6. Skill and docs scaffolding.**
- Depends on: none.
- Do: add one heading per stream to `packages/system-skills/native-game/SKILL.md` (empty sections allowed) so streams edit disjoint sections. Add `docs/plans/native-game-parallel-roadmap.md` that links this plan's card IDs to PRs as they land. Run `npm run check:agents-docs`.

### Stream B: baselines

**B1. Benchmark harness.**
- Depends on: none.
- Do: add `nodetool game bench <file>` (or a vitest bench in `packages/game-runtime/bench/`) that runs N ticks headless and reports p50, p95 and p99 tick time, per-system time (after W2), script time and allocations. Add fixtures: `bench-2d-500.json` (500 entities, 50 scripted, tilemap), `bench-3d-1000.json` (1,000 entities, 100 dynamic bodies, 30 scripted, 10 models). Add a browser bench that renders 600 frames and reports frame time, draw calls and triangles, using `capture`'s browser path. Extend `scripts/benchmark-effects.ts` rather than duplicating it.
- Accept: running it twice on the same machine gives p95 within 10%. Baselines saved to `docs/plans/native-game-baselines.md` with machine, browser and backend recorded.

**B2. Golden image set.**
- Depends on: none.
- Do: capture fixed-tick frames of every shipped example game and the bench fixtures with `nodetool game capture`. Store with a perceptual-diff tolerance test (SSIM or per-pixel threshold) so later cards can show visual change deliberately.

**B3. Exported build smoke test (G72).**
- Depends on: none.
- Do: after `nodetool game build`, serve the output, load it in headless Chromium, run 300 frames with scripted input, fail on console errors, missing assets or a stalled tick. Add as `nodetool game smoke <dir>` and to the `game-flow` selfcheck.

## 6. Wave 1 and later: workstreams

Each card lists dependencies on other cards. Cards without cross-stream dependencies start as soon as Wave 0 is merged.

### Stream R: 3D rendering

Targets: 60 fps at 1280×720 on a mid-range desktop GPU for `bench-3d-1000` with all R1–R4 features on at the "high" tier. Software rendering in CI proves correctness only.

**R1. Image-based lighting and sky (G2).**
- Do: add `environment.sky` to `gameEnvironment3D`: `{ kind: "color" }` (today's default), `{ kind: "hdri", assetId, rotation, intensity }`, `{ kind: "procedural", sunEntityId?, turbidity, rayleigh, groundColor }`. Generate a PMREM environment map for both. Use it as `scene.environment` with `environmentIntensity`. Link the procedural sun to a directional light. Add an `hdri` asset media kind (equirectangular `.hdr` or `.exr`, size budget) with preparation in stream C's pipeline through an interface request.
- Accept: golden captures with each sky kind. A PBR sphere grid fixture shows reflections. Default documents render identically to before.

**R2. 3D post-processing stack (G3).**
- Depends on: R1.
- Do: add `postProcessing` to the scene (and later volumes) with ordered effects: exposure, tone mapping choice (ACES, AgX, Neutral), bloom, SSAO or GTAO, colour grading with LUT (reuse the 2D LUT asset format), SMAA or FXAA, vignette, depth of field, chromatic aberration. Implement as passes in `RenderPipeline3D` using three's `EffectComposer` on WebGL2. Keep each effect's parameters bounded. Reuse the parameter vocabulary of 2D `renderEffects` where meanings match.
- Accept: each effect has a golden capture. B1 browser bench shows the cost per effect. Disabling all effects reproduces R1 output.

**R3. Shadows (G4).**
- Do: cascaded shadow maps for the directional light (2 to 4 cascades, configurable split), shadows on point and spot lights with a per-light toggle and a scene-wide budget (for example at most four shadowed local lights), shadow bias and normal bias fields.
- Accept: a 200 m scene fixture shows sharp near shadows and continuous far shadows. Budget overflow produces a diagnostic, not a crash.

**R4. Material system (G5).**
- Do: give primitives texture slots (base colour, normal, ORM, emissive) with UV tiling and offset. Support glTF extensions `KHR_materials_clearcoat`, `transmission`, `sheen`, `specular`, `ior`, `volume` in preparation's allow-list (`preparation.ts` is owned by C, so request the allow-list change). Add material presets as named document-level materials (`materials: Record<id, Material3D>`) that entities reference, plus a `toon` shading model with outline option. Keep arbitrary shader code out of scope.
- Accept: generated textures can be applied to a box via the agent. Toon preset golden capture.

**R5. Environment and lighting presets (G58).**
- Depends on: R1, R2, R3.
- Do: ship preset bundles (sky, sun, ambient, fog, post) as data in `packages/protocol/src/game3d/presets.ts`. Expose them through an "apply preset" document op and an editor control registered as an inspector editor for scene settings.
- Accept: each preset has a capture. The agent can apply one by name.

**R6. Height fog and decals (G9).**
- Do: exponential height fog alongside linear fog. Decal component projecting a texture onto receivers, bounded count per scene.

**R7. Selection outline and editor overlay passes (G65, G48 rendering part).**
- Do: an editor-only outline pass for selected ids, light range and cone helpers, and a wireframe, unlit and overdraw view mode switch in the pipeline. These are editor passes, excluded from player and capture builds.
- Accept: E6 consumes the view modes without touching renderer files.

**R8. WebGPU 3D renderer (G1).**
- Depends on: R1–R7, V3, U2, N1 renderer parts merged. Declares the renderer freeze.
- Do: switch to three's `WebGPURenderer` with automatic WebGL2 fallback. Port post effects to TSL node post-processing. Keep `GameRendererCapabilities3D.backend` truthful (`webgpu` or `webgl2`). Share the GPU device with `packages/gpu` where possible.
- Accept: all R and V golden captures match within tolerance on both backends. Fallback path tested by forcing WebGL2. B1 numbers recorded for both.

**R9. Instancing, batching and LOD (G6).**
- Depends on: W3. Better after C4 (LOD generation).
- Do: automatically instance entities sharing a model or primitive and material when they have no per-instance animation. Use `BatchedMesh` for static mixed geometry. Support LOD levels from model bindings, with screen-size thresholds.
- Accept: `bench-3d-1000` draw calls drop by at least 5× with the same capture.

**R10. Quality tiers and render scale (G41, G70).**
- Do: document-level quality tiers (low, medium, high) that map to shadow, post and resolution settings. Dynamic resolution that holds a target frame time. Fixed internal resolution with integer scaling option for pixel-art 3D. Player-facing setting surfaced through U3's settings screen.

**R11. Lightmap baking (G8). P2.**
- Do: server-side bake via the existing headless Blender (`packages/blender-nodes`) for static geometry, stored as a prepared asset, applied as a second UV lightmap. Light probes for dynamic objects.

### Stream V: 2D rendering and VFX

**V1. Particle core (G10).**
- Do: `packages/game-renderer/src/particles/` with a CPU simulator: emitters with rate and bursts, shape (point, circle, sphere, cone, box, edge), lifetime, start speed, size, rotation and colour ranges, curves over lifetime, gravity, drag, sub-emitters on death, world or local space, max particles per emitter and per scene. Particle state is presentation only. Seed per emitter from the entity id so captures are stable. Add the `particles` component schema and `emitParticles` script command (a presentation event from W2).
- Accept: unit tests for curve evaluation and emission counts. Particle simulation never appears in snapshots (test).

**V2. 2D particle rendering.**
- Depends on: V1.
- Do: render particles in the WebGPU sprite path as instanced quads with additive or alpha blend, sprite sheets, and lighting opt-out. Canvas2D fallback with a lower cap.

**V3. 3D particle rendering.**
- Depends on: V1, W3.
- Do: billboard, stretched-billboard and mesh particles as a `RenderPipeline3D` pass. Soft particles with depth fade when depth is available.

**V4. Curve and gradient editor primitives.**
- Do: `ui_primitives/CurveEditor` and `GradientEditor` usable by inspector editors (V5, N, A, E10). Keyboard accessible.

**V5. Particle inspector and presets.**
- Depends on: V2, V3, V4.
- Do: inspector editor for the particle component with live preview, and a preset library (fire, smoke, sparks, dust, magic, rain, snow, explosion).

**V6. 2D normal maps and shadows (G11).**
- Do: optional normal-map binding per sprite (generated through stream C from a depth model), normal-mapped lighting in the light pass, and 2D shadow casters from colliders.

**V7. Nine-slice, masks and sprite effects (G12).**
- Do: nine-slice sprites (also used by U2), sprite masks, and a bounded set of sprite effects (outline, dissolve, flash, palette swap) as parameters, not custom shaders.

**V8. Build-time atlas packing (G37) and GPU particles.**
- Depends on: R8 for GPU particles.
- Do: pack small sprites into atlases in `nodetool game build`. Add a compute-shader particle path on WebGPU for emitters above a threshold.

### Stream P: physics

**P1. Rapier 2D engine (G13, G14).**
- Sub-PRs: P1a schema and engine version, P1b spatial adapter, P1c migration tool, P1d editor support.
- Do: introduce a new 2D schema version and engine version (per `native-game-3d-upgrade.md` D1) whose physics runs on `@dimforge/rapier2d-compat` pinned exactly. Reuse the spatial seam the 3D upgrade introduced (`native-game-3d-upgrade.md` D2) with a 2D adapter. Support static, kinematic and dynamic bodies, box, circle, capsule and convex polygon colliders, rotation, one-way platforms (via contact modification or solver hooks), tilemap colliders merged into chains, sensors, and a 2D character controller with the same settings as `character3d` plus platformer features (coyote time, jump buffer). Old 2D documents keep running on engine "1" unchanged. Add `nodetool game migrate --to <version>` that converts a document and reports behavior differences found by simulating both.
- Accept: the platformer example migrated plays its scripted input to the same win tick within a stated tolerance. `bench-2d-500` physics time is lower than engine "1".

**P2. Joints (G15).**
- Do: a `joints` list on the scene: fixed, revolute (hinge with limits and motor), prismatic (with limits and motor), spherical, rope and spring, connecting two entity ids with anchors. Joint state in the snapshot via Rapier serialisation. Script commands to set motor targets.
- Accept: door hinge, chain and piston fixtures replay deterministically.

**P3. Physics materials and combine rules (G16).**
- Do: document-level `physicsMaterials` with friction, restitution and combine modes. Colliders reference a material id or keep inline values.

**P4. Collision layer matrix (G66).**
- Do: document-level named layers and a symmetric collision matrix. Colliders pick a layer by name. Category and mask bits are derived. Keep raw bits as an advanced override for existing documents.
- Accept: existing documents produce the same bits. The inspector editor (registered by P) shows the matrix.

**P5. Forces and torques (G68).**
- Do: `addForce`, `addTorque`, `addForceAtPoint` script commands, accumulated for one tick.

**P6. Simulation settings (G69, G18).**
- Do: document-level `simulation` with tick rate from an allowed set (30, 60, 120), physics substeps, solver iterations, and a default seed. Every consumer of `tickRate: 60` reads the setting. Hosts pass the seed.
- Accept: a 120 Hz fixture runs at real time in the player. Existing documents are unchanged.

**P7. Physics debug data.**
- Do: expose contacts, normals, sleeping state and query rays as presentation events or a debug snapshot for E6.

**P8. Vehicles and ragdolls (G17). P2.**
- Depends on: P2, N1.
- Do: a raycast vehicle component on Rapier's vehicle controller. Ragdoll generation from a humanoid skeleton with joints, switchable from animation.

**P9. Interest management for simulation (G38 part).**
- Do: optional per-entity simulation distance and sleeping of scripts and bodies outside it, with determinism preserved (activation decided by simulation state only).

### Stream A: audio

**A1. Mixer and buses (G20).**
- Do: a bus graph in `audio/`: master (with limiter), music, sfx, voice, ui, and user-defined buses. Per-bus volume, mute, low-pass, and send to reverb. Ducking rules (music ducks under voice). Snapshot transitions between mixer states on events. Document-level `audio.mixer` schema.
- Accept: unit tests with an `OfflineAudioContext` render known gain envelopes.

**A2. Spatial audio (G19).**
- Depends on: A1, W2 (presentation channel carries emitter transforms).
- Do: per-voice `PannerNode` (HRTF or equal-power by quality tier), listener from the active camera, distance models and rolloff curves, cone settings, doppler. `audioSource` gains `spatial`, `minDistance`, `maxDistance`, `rolloff`. Positions update every rendered frame from interpolated transforms.
- Accept: offline-rendered test shows left-right panning for an emitter at x=±5.

**A3. Streaming music (G21).**
- Do: long tracks play through `MediaElementAudioSourceNode` routed into the music bus, with loop points and crossfades. Sync offset to snapshot tick on resume as today.

**A4. Sound design features. P2.**
- Do: random containers (one of N), pitch and volume variance, priority-based voice stealing, reverb zones (convolution with bundled impulse responses), simple occlusion by raycast against static colliders (presentation-only query).

### Stream N: animation

**N1. Animation graph runtime (G22).**
- Do: `animationGraphs` at document level, referenced by `animator3d.graph`. States with clips or blend spaces (1D and 2D), transitions with conditions on parameters (float, bool, trigger), exit time and duration, layers with bone masks and additive mode. Graph state (current state, transition progress, parameter values) is simulation state in the snapshot. Pose sampling stays presentation. Script commands `setAnimParam`. Keep `playAnimation` working by mapping it to a direct state change.
- Accept: idle, walk and run blend by speed in a capture sequence. Replay is identical.

**N2. Animation events and root motion.**
- Do: events at clip times emitted deterministically from graph state (footstep sound, spawn hit box). Optional root motion applied to the character controller as simulation input.

**N3. Humanoid retargeting and shared clip libraries (G23).**
- Do: at preparation (interface request to C), detect common humanoid rigs (Mixamo, VRM, Unreal mannequin naming) and map to a canonical humanoid. A shared library asset of clips on the canonical rig. Runtime retargets library clips onto any mapped model.
- Accept: a generated rigged model with no clips plays library idle, walk, run and jump.

**N4. IK (G24).**
- Do: two-bone IK for feet with ground raycast (presentation-only query) and look-at for head. Toggles per animator.

**N5. 3D tracks (G25).**
- Do: keyframed transform, light and material tracks per entity with easing, like 2D `visualAnimation`, plus a kinematic mode that moves physics bodies deterministically (moving platforms without scripts).

**N6. Clip preview in the editor.**
- Do: inspector editor for `animator3d` with a clip list, scrubber and play in the viewport without entering play mode.

**N7. Animation graph editor (G57).**
- Depends on: N1, W4.
- Do: a bottom-dock panel that edits the state graph with `@xyflow/react`, matching the visual language of the workflow editor. Parameter list, transition inspector, live state highlight during play.

### Stream S: scripting and gameplay runtime

**S1. Script input cost (G26).**
- Do: stop embedding the input JSON in evaluated source per call (`scripts.ts:243-246`). Compile each script once per session and keep the function resident. Pass the per-tick world once per tick as a shared frozen value inside the QuickJS context, not once per call. Add `world.near(radius)` and `world.byTag(tag)` queries so scripts stop iterating the full list.
- Accept: B1 shows script time on `bench-3d-1000` drops by at least 5×. All script tests pass. Budgets still interrupt runaway scripts.

**S2. Tags and entity properties (G27).**
- Do: `tags: string[]` and `props: Record<string, JSON>` on entities, both 2D and 3D. Scripts read `entity.tags`, `entity.props`, other entities' tags and props, rotation and active state. Props can be changed by script commands and are snapshot state.

**S3. Script parameters bound to the inspector (G71).**
- Depends on: S2, W4.
- Do: a script behavior declares `params` as a JSON-schema-like object (number with range, boolean, colour, enum, entity reference, asset reference, vector). The behavior stores `values`. The inspector renders them through `SchemaFields`. Scripts receive `input.params`. Validation checks entity and asset references.
- Accept: changing a param in the inspector changes play behavior without editing source. The agent can set params through ops.

**S4. Lifecycle hooks and timers (G28).**
- Do: a script may export an object with `onStart`, `onUpdate`, `onFixedUpdate` (alias of update at tick rate), `onContact`, `onTriggerEnter`, `onTriggerExit`, `onDestroy`, `onSceneEnter`. Keep the plain-function form working. Add deterministic timers (`after(ticks, name)`, `every(ticks, name)`) stored in snapshot state.
- Accept: hook order test. Timer replay identical.

**S5. Typed events (G32).**
- Do: `emit` gains an optional payload (bounded JSON) and target (entity id, tag, or broadcast). Hooks receive payloads.

**S6. Script hot reload during play (G67).**
- Depends on: S1, K2.
- Do: on script edit during play, recompile the changed script and continue the session from the current tick with existing script state. If compilation fails, keep the old function and show the error in the console (E3). Offer "restart from tick 0" separately.
- Accept: edit a speed constant while playing and see the change without the tick resetting.

**S7. Player saves (G30).**
- Do: a `save`/`load` script command and player API backed by a per-game storage adapter (IndexedDB in the standalone player, project storage in the editor). Save data is a bounded JSON object plus optional full snapshot. Settings saves are separate from progress saves.

**S8. Persistent entities and additive scenes (G31). P2.**
- Do: `persistent: true` entities survive scene transitions. Additive scene load and unload commands.

### Stream U: input and game UI

**U1. Input bindings (G33, F22, F23).**
- Do: document-level `inputBindings`: per action, a list of bindings (key, mouse button, gamepad button, gamepad axis with dead zone and inversion, touch control). Axes composite from keys or sticks. Defaults generated from today's naming rules so existing games behave the same. Gamepad polling per tick via `navigator.getGamepads`. Pointer lock for look in 3D. 3D touch controls in the standalone player. Player-facing rebinding stored through S7 when available.
- Accept: existing example games play identically with generated default bindings. A gamepad simulated in Playwright drives the 3D fixture.

**U2. HUD widget tree (G34).**
- Do: a `ui` tree on the document and scene: nodes `panel` (colour or nine-slice image from V7), `image`, `text`, `bar` (value bound to a script-set variable or entity health), `button` (emits an event), `stack` and `grid` containers. Anchors and pivots relative to the HUD rectangle, safe-area aware. Script commands to set text, values and visibility. Render in both the WebGPU 2D HUD pass and the 3D HUD module with the same layout code (shared layout engine in `src/ui/`). Keep `hud` labels working as a compatibility layer.
- Accept: a health bar, score panel and pause button fixture renders identically in 2D and 3D captures. Buttons work with mouse, touch and gamepad focus navigation.

**U3. Screens and menus.**
- Depends on: U2, S7.
- Do: `screens` (title, pause, settings, game over, custom) built from U2 nodes, with transitions and pause semantics. A default settings screen exposes volume buses (A1), quality tier (R10) and bindings (U1).

**U4. Localisation and rich text (G35). P2.**
- Do: string tables keyed by locale, `t("key")` in UI and scripts, simple markup for colour and inline icons, right-to-left layout.

### Stream G: navigation and AI

**G1n. Navmesh bake (G29).**
- Do: bake navmeshes from static colliders and walkable surfaces with `recast-navigation-js` (WASM, pin version) at publish and on demand in the editor. Store as a prepared asset with digest. Agent radius and height profiles.

**G2n. Path queries and agents.**
- Depends on: G1n.
- Do: `navAgent` component with speed and avoidance, `moveTo` and `findPath` script commands, crowd simulation run deterministically inside the simulation tick.
- Accept: replay identical with 20 agents.

**G3n. 2D grid pathfinding.**
- Do: A* over tilemaps and a grid derived from colliders, same `findPath` command.

**G4n. Navmesh debug overlay.** Register an overlay for E6.

### Stream E: editor UX and tooling

**E1. Docking and saved layouts (G62).**
- Depends on: W4.
- Do: resizable, tabbed, drag-to-dock regions with layout persistence per user and named layouts (Default, Scripting, Animation, Wide). Prefer existing workspace panel primitives. A docking library is allowed after dependency review.

**E2. Shortcut manager and command palette (G60).**
- Do: one registry of editor commands with default shortcuts shared by 2D and 3D, a rebinding view, and a command palette (Ctrl/Cmd+K) that also lists agent actions.

**E3. Console panel (G52).**
- Depends on: W2 (diagnostic channel).
- Do: errors, warnings and script `log` output with tick, entity link, collapse of repeats, filters, and "Ask the assistant" per line.

**E4. Profiler panel (G51).**
- Depends on: W2, B1.
- Do: frame-time graph, per-system CPU time, script time per entity, draw calls, triangles, texture and geometry memory, physics body and contact counts, audio voices. Capture and export a profile.

**E5. Gizmos, snapping and multi-select (G45, G46).**
- Do: local or world toggle, pivot mode, snap increments per mode, surface snap and align to ground (raycast), multi-select with one gizmo in 3D, orbit around selection, scene orientation gizmo with axis views and orthographic toggle.

**E6. Debug view modes (G48).**
- Depends on: R7, P7.
- Do: viewport menu for wireframe, unlit, overdraw, colliders, contacts, sleeping bodies, light bounds, navmesh (G4n), audio emitter ranges.

**E7. Scene view and game view (G49).**
- Do: a separate game view panel showing the active camera at the game's aspect ratio while the scene view stays free, plus camera preview inset on camera selection and camera bookmarks.

**E8. Live runtime inspection (G53).**
- Depends on: K2.
- Do: select runtime entities during play, see live state (transform, velocity, script state, animation state), edit values on the live session, and "apply to document" for selected fields.

**E9. Script debugging and replay scrubber (G54).**
- Depends on: E3.
- Do: a timeline scrubber over replay history, step a single tick, watch an entity's script state over ticks, and per-entity script error tools in 3D (port from 2D).

**E10. Component editors (G55).**
- Depends on: V4.
- Do: inspector editors registered per component: colour picker with HDR intensity, asset picker with thumbnails (from C1), collider "fit to mesh", light colour temperature, camera preview, material editor with preview sphere (with R4).

**E11. Onboarding (G63). P2.**
- Do: empty-scene guidance, component tooltips sourced from schema descriptions, starter scenes.

### Stream C: content pipeline and assets

**C1. Asset browser (G50).**
- Depends on: W4.
- Do: a bottom-dock panel listing assets, prefabs and scenes with thumbnails (rendered with the game renderer for models, generated for audio as waveforms), search, type filters, references ("used by"), replace-in-place, and slot actions: generate, regenerate with a new prompt, pick from staged candidates. Generation goes through the existing slot prompt and staging flow (`packages/game-nodes`, `game-slot-prompt.ts`).

**C2. Drag to place (G47).**
- Depends on: C1, E5 (surface raycast).
- Do: drag assets and prefabs into the viewport to create entities on the surface under the cursor, with snapping.

**C3. Model optimisation at preparation (G7).**
- Do: in `renderer3d/preparation.ts`, use `@gltf-transform/functions` and `meshoptimizer` to weld, simplify above budget, quantise, compress with meshopt, and transcode textures to KTX2 with a size cap per tier. Accept Draco and meshopt inputs by decoding at preparation. Register `MeshoptDecoder` and `KTX2Loader` in the loader module (owned by C). Bump `preparationVersion`.
- Accept: a 40 MB generated model prepares to under a stated size with an SSIM-bounded capture. Existing prepared assets still load.

**C4. Import settings (G36).**
- Do: material overrides at import, collider generation options including convex decomposition (V-HACD or CoACD WASM after dependency review), LOD generation for R9, pivot editing and texture max size.

**C5. Prefab editing (G56).**
- Depends on: W4, W5.
- Do: open a prefab in isolation in the viewport, nested prefabs, variants, per-field apply and revert of overrides, and override markers in the inspector.

**C6. Per-scene asset loading (G40).**
- Do: scene asset manifests, progressive loading with a loading screen (U3), and unloading on scene exit.

**C7. Greybox editing (G59). P2.**
- Do: face handles on box primitives to extrude and resize, with UV-preserving world-space texturing.

### Stream D: performance architecture and delivery

**D1. Simulation in a worker (G39).**
- Depends on: W2, S1.
- Do: run the session in a dedicated worker in the player and editor play mode. The main thread sends input frames and receives render frames and presentation events through transferable buffers. Keep a main-thread fallback.
- Accept: B1 shows render frame time unaffected by a deliberately slow script up to the script budget.

**D2. Frame budget and distance culling (G38).**
- Do: render-side distance culling per entity and per layer, and budgets that warn in the console when exceeded (draw calls, triangles, particles, voices).

**D3. PWA and embedding (G42).**
- Do: manifest and service worker in standalone builds, offline play, and an embed snippet with a postMessage API (start, pause, events, score).

**D4. Shipped-game diagnostics (G43).**
- Do: optional error reporting hook in standalone builds that respects the project's error-tracing redaction rules (`docs/error-tracing.md`).

**D5. Release checks.**
- Do: add B3's smoke test to the publish flow, and size budgets for builds.

### Stream M: milestone games

M builds showcase games that exercise many streams at once. Each milestone is the integration test for the cards it lists. M works through the agent and the editor, not by hand-editing JSON, and files bugs back to the owning stream.

**M1. 3D third-person showcase.** After R1–R4, U1, U2, N1, A2, S1–S4. A generated character with library animations, physics props, a HUD with health and score, spatial audio and post-processing. Must hit the R stream frame target.

**M2. 2D physics platformer.** After P1, V2, V5, U1, U2, A1. Dynamic crates, slopes, particles and menus.

**M3. Full loop.** After U3, S7, C1–C3, B3. Title screen to win screen with saved progress, built and smoke-tested as a standalone build.

## 7. Dependency graph

Arrows read "must merge before".

```
K1 ─┬─> K4, K6
    └─> W4
K2 ─┬─> W4
    ├─> S6
    └─> E8
K3 ─> W4
K5 ─> W4
W1 ─> W2 ─┬─> S1 ─> S6, D1
          ├─> E3 ─> E9
          ├─> E4 (also needs B1)
          ├─> A2 (also needs A1)
          └─> V1 (presentation channel)
W3 ─┬─> R1 ─> R2 ─> R5 (also R3)
    ├─> R3, R4, R6, R7, R9
    ├─> V3 (also V1)
    ├─> U2
    └─> C3 (loader module)
W4 ─┬─> W5 ─> C5
    ├─> E1, E2, E5, E7, E10, C1 ─> C2
    ├─> S3 (also S2)
    └─> N7 (also N1)
R1–R7 + V3 + U2 + N1 ─> R8 ─> V8
P2 + N1 ─> P8
R7 + P7 ─> E6
U2 + S7 ─> U3 ─> M3
G1n ─> G2n
```

## 8. Suggested allocation for twelve agents

| Agent | Wave 0 | After Wave 0 |
|---|---|---|
| 1 | K1, K4, K6 | R1, R2, R5, R8 |
| 2 | K2, K5 | S1, S2, S3, S6 |
| 3 | K3, K7 | E5, E6, E7, E8 |
| 4 | W1, W2 | S4, S5, S7, S8 (S takes over session ownership) |
| 5 | W3 | R3, R4, R6, R7, R9, R10 |
| 6 | W4, W5 | E1, E2, E3, E4, E9, E10 |
| 7 | W6, B1, B2, B3 | D1, D2, D3, D4, D5 |
| 8 | (starts after Wave 0) | P1 (all sub-PRs), P4, P6 |
| 9 | (starts after Wave 0) | P2, P3, P5, P7, P9, then G1n–G4n |
| 10 | (starts after Wave 0) | V1–V8 |
| 11 | (starts after Wave 0) | U1–U4, then A1–A4 |
| 12 | (starts after Wave 0) | C1–C7, then N1–N7 |

M1–M3 run on whichever agent frees up first after their dependencies land. With fewer agents, keep the stream boundaries and give one agent several streams in sequence. Do not split one stream across two agents at the same time.

## 9. Launch prompt for a workstream agent

Fill in `<STREAM>` and give the agent this prompt, this plan and the gap analysis.

```
You are the implementation agent for stream <STREAM> of the NodeTool native game engine roadmap.

Repository: nodetool-ai/nodetool. Read AGENTS.md, docs/DEVELOPMENT_STANDARDS.md, docs/HARNESS_FIRST.md,
docs/plans/native-game-3d-upgrade.md and the implementation plan at
docs/plans/native-game-implementation-plan.md before writing code.

Work through the task cards of stream <STREAM> in order. For each card:
1. Check that every card in its "Depends on" line is merged to main. If not, take the next card whose
   dependencies are met. If none is available, stop and report what you are blocked on.
2. Create a branch named game/<stream>-<card id>, for example game/r-r1.
3. Re-check the file and line references in the card against current main.
4. Write failing tests first for new behavior and for bug reproductions.
5. Implement the card within the files your stream owns (section 4). For anything else, use the
   shared-file protocol (section 4.3). Never edit another stream's files beyond a registration line.
6. Keep determinism (section 2.3) and schema rules (section 2.4). Presentation state never enters snapshots.
7. Make the feature reachable by the in-product agent and the nodetool game CLI (section 2.5).
8. Update your stream's section of packages/system-skills/native-game/SKILL.md when authoring changes.
9. Run the four mandatory checks and fix every failure before opening the PR.
10. Open one PR per card, titled "game: <summary> (<gap and finding ids>)". In the body, list what
    changed, the tests added, benchmark numbers for performance cards and any capture diffs.
11. Drive the PR to green CI. Address review comments. Then move to the next card.

Do not start cards from other streams. Do not widen a card's scope. If a card's design turns out to be
wrong, stop, write down why with evidence in the PR description, and propose the change instead of
silently implementing something else.
```

## 10. Risks and how the plan handles them

Risks use X codes so they do not collide with stream R card IDs.

| ID | Risk | Handling |
|---|---|---|
| X1 | Seams in Wave 0 take longer than expected and block everyone. | W1, W3 and W6 have no dependencies and run in parallel. K runs alongside. Streams P and G can start design spikes (no merges) during Wave 0. |
| X2 | Replay divergence from runtime changes. | Section 2.3 plus fixtures in every runtime PR. `GAME_PHYSICS_BUILD_3D` and new engine versions for behavior changes. |
| X3 | Visual regressions slip through parallel renderer work. | B2 golden captures with tolerance, required in every R, V and U PR. Renderer freeze for R8. |
| X4 | Schema growth makes documents hard for the agent to author. | Every new field needs an eval case in `evals/surfaces/game.ts` and a skill section update. Defaults reproduce existing behavior. |
| X5 | WebGPU support varies across browsers. | R8 keeps automatic WebGL2 fallback. All features except GPU particles must work on WebGL2. |
| X6 | Rapier 2D migration changes the feel of existing 2D games. | Engine "1" stays. Migration is opt-in with a behavior report (P1c). |
| X7 | New WASM dependencies (Rapier 2D, Recast, decomposition) increase load size. | Lazy-load per feature, record size in the PR, and include them in B3's size budget. |
| X8 | Agents duplicate work across streams. | Ownership map in section 4 and interface-request PRs. One agent per stream at a time. |
