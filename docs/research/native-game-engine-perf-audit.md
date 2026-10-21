# Native game engine: performance audit

Scope: `packages/game-renderer/src`, `packages/game-runtime/src`, `packages/protocol/src/game3d`, `web/src/components/game/useGamePlaySession3D.ts`, the `nodetool game` CLI, and the shipped game skills. The audit read the working tree, including the uncommitted RIDGELINE fixes. No files were changed.

Evidence labels:

- **Confirmed**: the code path is read and the behavior follows from it directly.
- **Hypothesis**: the code path is read, but the cost size was not measured.

Line numbers refer to the working tree on 2026-10-21.

## Summary

1. The 3D path does a lot of work for every rendered frame and every tick. Its cost scales with entity count, mesh count, particle count, HUD size and render resolution. The RIDGELINE fixes removed the largest items, but several others of the same kind remain (F30 to F41).
2. The costliest document settings are the ones that add whole scene passes. These are shadow cascades, shadowed point and spot lights, soft particles, the procedural sky linked to a moving sun, decals on moving receivers, and bloom.
3. Every script tick serializes the whole active world to JSON. The 64 KiB script input limit then sets a hard ceiling of a few hundred active entities in any scripted scene (F20).
4. Agents can measure tick cost (`game bench`) and renderer counters (`game capture --json`). They cannot measure browser frame time from the CLI. No tool fails on a slow game. `game bench` refuses any 3D game that has a prepared collider, which includes RIDGELINE (F26).
5. No shipped skill has a performance workflow. `native-game-reference` has scattered cost notes. No skill gives a frame-time target, says how to measure, or lists the authoring budgets below.

## 1. Settings and patterns whose cost scales badly

### Rendering (cost on every rendered frame, up to the display rate)

The standalone player renders on every `requestAnimationFrame` (`standalone-player3d.ts:201-213`). At 120 Hz with a 60 Hz tick, each tick is rendered twice. All per-frame costs below are paid at the display rate.

**F1. Render resolution comes from `presentation.hudWidth`.** Confirmed.

- The standalone player sizes the canvas to `hudWidth × hudWidth / aspectRatio` (`standalone-player3d.ts:82`). The HUD width is therefore also the 3D render resolution.
- The web editor sizes the canvas to its CSS box without `devicePixelRatio` (`useGamePlaySession3D.ts:276`).
- Fill-rate costs scale with this pixel count: the scene pass, MSAA resolve, bloom, the soft-particle depth prepass and the HUD texture upload.
- The WebGL context always requests `antialias: true` (`renderer3d/index.ts:386-389`). This is a hypothesis: when a composer is active, the default framebuffer MSAA does work that the composer target does not need.

**F2. Shadow cascades (`environment.shadows.cascades`).** Confirmed.

- Settings: `count` is 2 to 4 (default 3), `maxDistance` defaults to 200 and goes up to 5000, and `mapSize` is 512, 1024 or 2048 (`protocol/.../shadows.ts`).
- Each cascade that re-renders draws every `castShadow` mesh inside its shadow camera again. Those draws count toward the draw call and triangle budgets.
- After the RIDGELINE fix, cascade 0 renders every frame and cascade 1 every second frame. Cascades 2 and 3 render every fourth frame. A cascade also re-renders when its map drifts more than 5 % of its width (`shadows/cascades.ts:14-25` and `:203-213`). Even so, at most 2 cascades render per frame.
- The cascade width grows with `maxDistance`, so texel density drops as the distance grows. Large values such as RIDGELINE's 4500 make the far cascades cover several kilometres, so nearly every terrain chunk is a caster.
- Each cascade map at 2048 uses 16 MiB of depth.
- `setupMaterials` walks the whole scene twice per frame (F31).

**F3. `castShadow` defaults to `true` on every primitive and model** (`protocol/.../primitive.ts:10`, `model.ts:6`). Confirmed.

- Every ground plane, terrain chunk, forest and building casts into every cascade unless the author sets `castShadow: false`.
- A large flat terrain rarely needs to cast. It only needs to receive.
- This is the default an agent most often forgets.

**F4. Shadowed point and spot lights.** Confirmed.

- At most 4 cast shadows (`GAME_LOCAL_SHADOW_LIGHT_BUDGET_3D`, `shadows/index.ts:47-49`).
- Their maps use three.js's default `autoUpdate`, so they re-render every frame.
- A point light renders 6 cube faces per frame, capped at 1024 texels per face (`shadows/index.ts:69-81`).
- A non-cascaded shadowed directional light also re-renders its single map every frame (`shadows/index.ts:60-67`).

**F5. Procedural sky linked to a moving sun.** Confirmed.

- `sky.kind: "procedural"` keys its cube on the sun direction, `JSON.stringify([... sun.x, sun.y, sun.z])` (`environment/sky.ts:118-121`).
- When the key changes, it re-renders a 256² cube (6 passes) and runs a PMREM `fromCubemap` (`sky.ts:133-160`).
- A day/night cycle that rotates the sun light on every tick therefore rebuilds the sky and its environment map on every tick.
- A static sun costs nothing after the first frame. RIDGELINE's sun is static.

**F6. Height fog (`fog.kind: "height"`).** Confirmed.

- `GameHeightFog3D.configure` walks the whole scene to attach shader hooks. It runs twice per frame: once in the `environment-materials` pass (`renderer3d/index.ts:161-165`) and once before the pipeline (`renderer3d/index.ts:331`).
- The cost scales with the node count across all instanced models (`height-fog.ts:60-83`).
- Linear fog (`near`/`far`) has no traversal.

**F7. Post-processing.** Confirmed.

- Bloom, vignette, `fxaa` or `smaa` build an `EffectComposer` with two full-resolution half-float targets (`passes/post-processing.ts:127-128`, `:186-217`).
- `UnrealBloomPass` adds a mip chain of blur passes at the canvas size.
- `antialias: "msaa"` alone, or exposure and tone mapping alone, render directly at no extra cost (`post-processing.ts:37-47`).
- The rough order of cost is: bloom > smaa > fxaa ≈ vignette > none.

**F8. Soft particles (`softness > 0` on any emitter).** Confirmed.

- Each frame that has a soft particle runs a depth prepass at full drawing-buffer size (`particles/pass3d.ts:216`, `:236-266`).
- The prepass walks the whole scene and swaps materials (`pass3d.ts:268-287`). After the fix, it skips meshes outside the soft-emitter bounds.
- Wide soft emitters still make their bounds large. RIDGELINE has 26 cloud entities with 4 soft emitters each. If their boxes overlap the terrain chunks, the terrain is still drawn into the prepass.
- The prepass counts toward the draw call and triangle budgets.

**F9. Particle count and emitter layout.** Confirmed, with one hypothesis.

- Limits: an emitter's `maxParticles` is 1 to 4096 (default 256) (`protocol/src/game-particles.ts:84`). The scene cap is 8192 (`simulator.ts:53`). The player budget is 4096.
- Every live particle is copied into a new object on every rendered frame (`renderer3d/index.ts:261`). It is spread into another object when visited (`particles3d.ts:98`). See F30.
- `colorOverLifetime` parses two hex strings and allocates two objects per particle per frame (`curves.ts:47-48`).
- A `local`-space emitter allocates point and velocity objects per particle per frame (`simulator.ts:240-248`).
- Particles split into one draw per contiguous run between transparent scene depths (`particles3d.ts:241-266`). More emitter kinds and more transparent scene meshes give more draw calls.
- `transparency.depths` walks the whole scene whenever any particle is live (`transparency3d.ts:36-75`).
- Hypothesis: run keys such as `kind:1` and `kind:2` appear and vanish from frame to frame. Each vanished key releases its `ShaderMaterial` and geometry, and a new key creates them again (`pass3d.ts:213-214`, `:317-365`).
- Mesh-shape particles (`box`, `sphere` …) compose a matrix per particle on the CPU every frame (`pass3d.ts:381-397`). Quads upload one interleaved buffer.

**F10. Decals.** Confirmed.

- Any decal makes the renderer call `scene.updateMatrixWorld(true)` every frame (`decals/index.ts:67`).
- It also rebuilds each receiver signature from string concatenation of every receiver mesh's matrix (`decals/index.ts:120-143`).
- The decal key includes the projector's and the receiver's `matrixWorld` (`decals/index.ts:93`). A decal on a moving projector or a moving receiver therefore re-projects its geometry on the CPU every frame. Interpolated motion also counts as moving.
- A scene can have at most 32 decals.

**F11. Many model entities: no instancing and no material sharing.** Confirmed.

- Each model entity clones the glTF scene graph (`cloneSkeleton`, `assets/instances.ts:22`) and every material (`instances.ts:66-67`).
- Each primitive entity creates its own `BoxGeometry`, `SphereGeometry` and so on (`instances.ts:9-12`).
- N entities that share one model cost N × (meshes per model) draw calls, with no batching.
- Repeated props such as trees, rocks and fence posts must be baked into a few merged GLBs, as RIDGELINE does with `forest-0..3`. They should not be one entity per prop.
- Primitive spawn and despawn churn creates and disposes GPU buffers each time.

**F12. Model size and mesh chunking.** Confirmed.

- Model budgets per GLB: 250,000 triangles, 4096 nodes, 64 MiB geometry and 128 MiB textures (`preparation.ts:34-40`).
- three.js frustum-culls per mesh by bounding sphere. A single huge terrain mesh is never culled, either in the main pass or in any shadow cascade.
- Split terrain into chunks of a few hundred metres, as RIDGELINE does with `terrain-0..3`, so that the view and each cascade cull chunks.
- Every scene walk in F6, F8, F9 and F31 also scales with the node count.

**F13. Distance culling (`renderCulling`, `performance.cullLayers`).** Confirmed.

- Culling is per entity, measured to the entity origin (`culling.ts:12-24`, `presentation3d.ts:42-56`).
- It only hides the object. Simulation, physics, scripts and the scene walks still include the entity.
- The resolver walks the parent chain and allocates a `Set` per entity per tick (`presentation3d.ts:45`).
- It is the only LOD-like tool. The engine has no mesh LOD.

**F14. Skinned and animated models.** Confirmed.

- The animation sample key includes the fractional tick (`scene-sync.ts:64-65`, `:72-73`). Every animated entity is therefore re-sampled on every rendered frame.
- When the pose changes, every `SkinnedMesh` runs `computeBoundingBox()` (`scene-sync.ts:84-90`). In three.js this skins every vertex on the CPU. The cost scales with skinned vertex count × animated entities × frame rate.
- Animation graphs (`animationPose`) allocate per-bone accumulators per layer per frame (`animation/index.ts:142-170`). They also `JSON.stringify` the pose per entity per frame.

**F15. HUD and UI tree.** Confirmed, with one hypothesis.

- `GameUiController.update` runs `layoutGameUi`, with text measurement, on every rendered frame (`standalone-player3d.ts:169,186`, `ui/controller.ts:33-38`).
- `paintGameHud` now skips an unchanged HUD. However, it builds its cache key with `JSON.stringify(frame.ui, frame.hud)` every frame (`renderer3d/hud/paint.ts:12-14`).
- Hypothesis: any HUD value that changes on every tick (a speed readout or a timer) repaints the canvas and uploads the full `hudWidth × hudHeight` RGBA texture at the tick rate. That is 3.7 MB at 1280×720.

**F16. Lights without shadows.** Hypothesis based on three.js behavior. Each distinct light count compiles a new program variant for lit materials, so spawning or removing lights during play causes shader compiles. There is no light count cap besides the shadow budget.

**F17. Editor-only passes.**

- Selecting an entity during play adds a full-scene mask render for the outline (`passes/editor.ts:212-249`). Confirmed.
- Debug view modes swap every material (`passes/editor.ts:168-180`). Confirmed.
- These make editor fps lower than standalone fps.

### Simulation (cost on every tick, 60 Hz)

**F18. Static trimesh collider size.** Confirmed.

- `restoreReplayBoundary` runs `takeSnapshot()` and `restoreSnapshot()` on the Rapier world on every tick (`spatial3d/world.ts:355-379`, called at `:382`). The cost scales with total collider data.
- Measured on RIDGELINE: about 1.5 ms per tick with a 13.5k-triangle ground.
- The limit is 750,000 vertex floats per prepared collider, which is 250k vertices (`protocol/.../collider-geometry.ts:5`). The session allows 3,000,000 (`session3d.ts:237`).
- Use a decimated collision mesh, not the render mesh.
- The same function also creates a new character controller per character per tick (`world.ts:368`).

**F19. Spatial queries are linear scans over every collider.** Confirmed structure. The cost size is a hypothesis.

- `rayQuery`, `shapeQuery` and the follow camera's `cameraDistance` each loop over every collider record and cast against each one (`world.ts:553-596`).
- They do not use Rapier's broadphase query pipeline. A trimesh cast uses its own BVH, but every primitive is still tested.
- A follow camera with `collisionRadius` pays one shape cast per collider per tick (`spatial3d/camera.ts:70`).
- Scripts may issue up to 64 spatial queries per tick (`systems/scripts3d.ts:261`). Each one is O(colliders).

**F20. Behavior scripts: the whole world is serialized on every tick.** Confirmed.

- When any script runs, `stepScripts3D` builds a world entry for every active entity: position, velocity, tags, rotation and props (`systems/scripts3d.ts:136-158`).
- The runner then calls `JSON.stringify({ calls, input, rngState })` and UTF-8 encodes it to check the 64 KiB input limit (`scripts.ts:548-553`).
- Consequence 1: the cost scales with active entity count × tick rate, even for scripts that never read `world`.
- Consequence 2: there is a hard ceiling. An estimate: an entity entry is about 170 bytes without props, so roughly 350 active entities in a scripted scene raise `Game script input exceeds 64 KiB`. Props and long ids lower that number.
- Each call's output is parsed, validated with zod, and stringified twice more for size accounting (`scripts.ts:724-741`).
- Each `world.get` stringifies its result for a size check, then marshals it property by property into QuickJS (`script-world.ts:150-158`).
- The limits are: `maxTickMs` 1 to 20 ms (default 8), a batch budget of 50 ms per tick, and 64 world queries per call (`script-world.ts:6`).
- Measured on RIDGELINE: about 2.4 ms per tick for 3 scripts.
- Authoring rules that follow from this:
  - Use few scripts.
  - Prefer one controller script over many small per-entity scripts.
  - Keep props small.
  - Avoid `world.query` without `near`/`radius`.
  - Avoid `setProp` and `ui` commands on every tick when the value has not changed.

**F21. Per-tick frame building.** Confirmed.

- `frame3D` deep-copies 2 transforms per active entity and 1 per light (`presentation3d.ts:96-97`, `:146`).
- It deep-copies the tick's events (`:19`), `document.materials` and every image binding (`:170-172`).
- It scans every entity of every scene for collectible behaviors (`:151-155`).
- All of this scales with document size, not with the active scene.

**F22. Spawning.** Confirmed. A spawned model entity clones its scene graph and materials on the first render (F11). A spawned body adds Rapier objects that the per-tick snapshot (F18) then carries. Bullet patterns that spawn and despawn every tick pay both costs.

**F23. Audio voices.** Confirmed. The player cap is 32 voices (`audio/player.ts:19`). The budget warns at 24. Spatial voices update every rendered frame. No large scaling trap was found.

**F24. Web editor play path.** Confirmed.

- The editor calls `session.inspect()` on every tick (`useGamePlaySession3D.ts:149`). That deep-copies every entity, its props and its animation graph (`session3d.ts:712-718`).
- It pushes the inspection and the frame into React state every 6 ticks (`useGamePlaySession3D.ts:158-161`).
- It copies particles twice per frame (`useGamePlaySession3D.ts:110` and `renderer3d/index.ts:261`).
- A replay checkpoint calls `snapshot()` every 600 ticks (`gameReplayHistory.ts:2`, `useGamePlaySession3D.ts:137`).
- Editor fps is therefore not a fair proxy for standalone fps.

## 2. What exists for measuring performance

| Tool | Command | Reports | Limits |
|---|---|---|---|
| Headless tick bench | `npm run dev:nodetool -- game bench <document.json> [--ticks 1200] [--warmup 300] [--seed 1] [--json]` (`packages/cli/src/commands/game.ts:295-308`, `game-benchmark.ts:37-110`) | p50/p95/p99 for `tickMs`, `scriptMs` and each system, `scriptCalls`, `physicsCounts` (bodies, contacts), `heapDeltaBytes`, sampled allocation bytes, machine | Uses empty input only. It needs a bare document and rejects the example wrapper `{name, document, …}`. **It throws for any 3D game with a prepared collider: `Prepared collider resolver required for terrain-collider` on RIDGELINE** (verified, F26). No thresholds and no exit code. Not in `docs/cli.md`. |
| Renderer counters | `npm run dev:nodetool -- game capture <file> --ticks N --out f.png --json [--assets-dir d] [--inputs f]` (`game.ts:427-492`, `:677-712`) | 3D: `drawCalls`, `triangles`, `geometries`, `textures`, `geometryBytes`, `textureBytes`, `targetBytes`, `modelLoadMs`, `renderMs` (one frame, CPU only, no GPU finish), `culledEntities`, plus `budget {limits, overruns}` | One frame only. It prints overruns to stderr but never fails. 2D captures return no counters. |
| Browser frame timing | `cd packages/game-renderer && npm run benchmark:effects -- --game <file> --assets-dir <dir> [--post-effects]` (`scripts/benchmark-effects.ts`, `scripts/benchmark-game.ts:48-76`, `renderer3d/capture-page.ts:69-82`) | `frameMs` p50/p95/p99 over 600 Chromium frames with `gl.finish()`, plus stats. `--post-effects` gives one line per post variant. | 3D only. It renders the initial pose ("static" scenario) with no simulation, particles or input. Assets must be named `<32-hex-id>.<ext>`. No CLI flag exposes it. |
| Frame budgets | `edit_native_game` op `set_performance` → `performance.budgets` (`protocol/.../performance.ts:22-38`) | `drawCalls` (default 1000), `triangles` (default 1,000,000), `particles` (default 4096), `voices` (default 24) (`frame-budget.ts:12`) | Counts only, no time. They warn once through `console.warn` in the standalone player. `validate` does not enforce them. |
| Export smoke | `npm run dev:nodetool -- game smoke <build-dir> [--json]` (`game-renderer/src/smoke.ts`) | `{ok, frames, ticks, errors}` over 300 frames | Not a performance test. |
| Editor profiler panel | `web/src/components/game/panels/profiler/` | Per step: `stepMs`, `scriptMs`, per-system time, bodies, contacts, voices. Per frame: `frameMs`, draw calls, triangles, bytes. Exports `nodetool.game-profile` JSON. | Human UI only. It measures the editor path, which carries the extra costs in F24. |
| Runtime switch | `createGameSession3D(..., { recordTimings: true })` (`session3d.ts:50-54`, `systems/pipeline.ts:50-62`) | `timings.systems[]`, `totalMs`, `physics` on each step, and `scriptStats` (`durationMs`, `byEntity`) | API only. The agent tools never turn it on. |
| Agent tools | `capture_native_game_frame` (3D returns `stats` with `renderMs`), `playtest_native_game`, `autoplay_native_game` | Renderer counters on capture. No timings anywhere. | No budget check, and no tick or frame time. |
| Bench fixtures | `packages/game-runtime/bench/bench-2d-500.json`, `bench-3d-1000.json`, `bench-3d-64-scripted.json` | Tests check determinism only (`tests/benchmark-fixtures.test.ts`) | No speed thresholds. |

Gaps, all confirmed by reading:

- **F25.** No command reports browser fps for a playing game. The only frame timing renders a static pose.
- **F26.** `game bench` passes no `resolveCollider` (`game-benchmark.ts:41-42`). Every 3D game with a `convexHull` or `triangleMesh` collider asset fails, and so does the per-tick snapshot cost in F18 that the bench should expose. Running it with empty input also leaves a flight sim or a driving game in an idle state that does not represent play.
- **F27.** No tool turns budgets or timings into a failing exit code. An agent has to read the JSON and judge for itself.
- **F28.** The one-frame `renderMs` in `game capture` is CPU submission time. It omits GPU time, so a fill-rate-bound scene can look cheap.

## 3. Existing game skills

Format rules for a shipped system skill:

- A skill is one directory, `packages/system-skills/<name>/`, with only `SKILL.md` in it. The frontmatter has `name` (lowercase, max 64 characters, equal to the directory name) and `description` (one line, max 1024 characters, no tags). `featured: true` is optional.
- The body has no size limit, but `load_skill` returns the whole file.
- A new directory ships without registration. Add `.agents/skills/<name>` as a symlink only if repository agents should see it.
- Run `npm run check:agents-docs`. `packages/agents/tests/shipped-skill-names.test.ts` checks the tool names a skill uses.
- An unfeatured skill is found only through `list_skills` or through a pointer from another skill, such as the routing lines in `native-game/SKILL.md:14-20`.
- A new non-engineering skill shows up as a project starter chip unless `ENGINEERING_SKILLS` in `web/src/components/projects/projectStarters.ts:122-136` lists it.
- Sources: `packages/system-skills/README.md`, `nodetool-skill-author/SKILL.md:50-108`, `scripts/check-agents-docs.mjs`.

| Skill | Size | Featured | Scope | Performance content |
|---|---|---|---|---|
| `native-game` | 312 lines, 19.3 KB | yes | Entry point for building and revising 2D and 3D games: tools, assets, audio, 3D authoring, validation | Playtest wall-time budget (`:38`). Triangle meshes only on static bodies (`:204-205`). "Model preparation checks resource budgets", without numbers (`:214`). Far tiles are omitted in 2D (`:290`). Event and spawn limits, without numbers (`:295-297`). Routes "performance fields" to the reference (`:17-19`). |
| `native-game-reference` | 884 lines, 54.5 KB | no | Field reference for scripts, particles, lighting, 3D rendering, physics, audio, HUD, culling and budgets | Most of the cost notes: script limits `maxTickMs`, 50 ms and 1000 ms (`:116-124`); plain function scripts are cheaper (`:66-71`); soft particles add a depth pass (`:491-495`); interleaved particle types add draws (`:500-503`); 32 decals (`:656-661`); cascades for scenes deeper than 30 m (`:663-670`); 4 local shadows and point lights render 6 times (`:672-676`); bloom, vignette and non-msaa AA add full-screen passes (`:711-716`); culling and default budgets (`:820-841`); "Run 10 s" reports script time by entity (`:847-848`). |
| `game-direction` | 99 lines, 5.9 KB | no | Feel, pacing and art direction before a build | Ticks are 60 Hz (`:54`). "Capture the busiest frame", but only as a visual check (`:92`). |
| `nodetool-3d-scene` | 110 lines, 5.5 KB | yes | glTF scene editing and Blender renders, not games | Only Eevee versus Cycles render time (`:32`). |
| `api-games` | 81 lines, 5.8 KB | no | `nodetool.games` calls from code actions | Only "an exhausted [autoplay] budget is inconclusive" (`:27`). Not symlinked into `.agents/skills`. |

What the skill set does not say. Each item below is absent from all five skills:

- A frame-time or fps target, or how the 60 Hz tick relates to the display rate.
- How to measure. Nothing names `game bench`, `game capture --json` stats, `benchmark:effects --game`, or the profiler JSON export.
- That `castShadow` defaults to true, and that terrain and large static meshes should usually set it to false (F3).
- Cascade cost versus `count`, `maxDistance` and `mapSize` (F2). Shadow `mapSize` cost in general.
- That repeated props are not instanced, so they must be merged into a few GLBs (F11). That big meshes must be chunked for culling (F12).
- Collision mesh size versus per-tick cost, and the advice to decimate trimesh colliders (F18).
- The script world serialization and its ~350-entity ceiling (F20). Spatial query cost (F19).
- That a procedural sky with a rotating sun rebuilds every tick (F5). Height-fog traversal (F6). Decals on moving receivers (F10).
- That render resolution equals `presentation.hudWidth` (F1).
- That editor fps is lower than standalone fps (F17, F24).
- Particle sizing (`maxParticles`, `rate`) and soft-emitter bounds (F8, F9).

## 4. Remaining engine-level bugs of the same kind as the fixed ones

Each item is per-frame or per-tick work that does not need to repeat. None is fixed in the working tree.

**F30. Per-frame particle copy.** Confirmed. Severity: high with many particles.

- `renderer3d/index.ts:261` converts every particle field with `gameParticleFieldFromSamples3D(gameParticleSamples3D(...))` on every render. That allocates one 16-field object per live particle. Visiting spreads another (`particles3d.ts:98`).
- The web hook does the same copy again before calling `render` (`useGamePlaySession3D.ts:110`).
- At RIDGELINE's ~3–4k particles this is 6–8k short-lived objects per frame, plus 12–16k in the editor, at 120 Hz.
- The copy exists for the capture page, which is a separate realm. The in-process players could pass the field directly.

**F31. Duplicate whole-scene walks per frame.** Confirmed.

- The cascade `setupMaterials` walks the scene in `update` (`shadows/cascades.ts:119`) and again in `bindMaterials` (`:134`).
- Height fog configures twice (`renderer3d/index.ts:161-165` and `:331`).
- In addition, the particle pass walks for transparency depths and for the soft depth swap.
- With cascades, height fog and soft particles, the scene is walked 5 or more times per frame on the CPU, before three.js's own render and shadow walks.

**F32. Particle colour gradient allocations.** Confirmed. `evaluateParticleGradient` calls `parseParticleColor` on two hex strings without an `out` object, which allocates 2 objects and 2 `slice` strings per particle per frame (`curves.ts:47-48`). Pre-parsing the gradient keys once per emitter removes this.

**F33. Per-entity `JSON.stringify` in scene sync.** Confirmed.

- `syncGameScene` stringifies `entity.model ?? entity.primitive` for every entity on every frame to detect descriptor changes (`scene-sync.ts:32`).
- It allocates 4 three.js objects per entity per frame in `interpolateGameTransform3D` (`scene-sync.ts:14-23`).
- It stringifies `animationPose` or `animation` per animated entity per frame (`:65`, `:73`).

**F34. CPU skinning for bounds.** Confirmed. `computeBoundingBox()` runs on every `SkinnedMesh` after every pose sample (`scene-sync.ts:84-90`), which is every frame for an animated character. It applies bone transforms to every vertex on the CPU. A cached bind-pose bound with a margin, or a per-tick update, would remove most of this.

**F35. Per-frame HUD layout and key serialization.** Confirmed.

- `hud.update` runs a full layout with text measurement every frame (`standalone-player3d.ts:169,186`). `paintGameUi` lays out again when it repaints (`ui/paint.ts:67`).
- The paint cache key stringifies the whole UI tree every frame (`renderer3d/hud/paint.ts:12`).
- Both could key on a per-tick version instead.

**F36. Per-tick world rebuild and serialization for scripts.** Confirmed. See F20 (`systems/scripts3d.ts:144-158`, `scripts.ts:548-553`). The serialized size is checked by building the full JSON string even when no script reads `world`.

**F37. Per-tick deep copies in `frame3D`.** Confirmed.

- `structuredClone(document.materials)`, the image bindings and the events are copied every tick (`presentation3d.ts:19`, `:170-172`).
- `document.scenes.some(... entities.some(... behaviors.some))` scans every scene's entities every tick (`presentation3d.ts:151-155`).
- These values change only when the document changes.

**F38. Per-tick character controller recreation.** Confirmed. `restoreReplayBoundary` creates a new `KinematicCharacterController` per active character every tick (`world.ts:368`). The old world's controllers are freed with the old world, so this is a cost rather than a leak. It adds to the snapshot round trip in F18.

**F39. Linear spatial queries.** Confirmed structure. `rayQuery`, `shapeQuery` and `cameraDistance` iterate every collider instead of using `world.castRay`, `intersectionsWithShape` or `castShape` with a filter (`world.ts:553-596`). Hypothesis: those Rapier calls would preserve the deterministic tie-breaking the loop provides only if ordering is handled explicitly.

**F40. Decal receiver signatures.** Confirmed. With any decal in the scene, every frame forces `scene.updateMatrixWorld(true)`, joins every receiver mesh's matrix into a string, and stringifies `drawRange` and `groups` (`decals/index.ts:67`, `:141`).

**F41. Small per-frame allocations.**

- Cascade placement allocates new `Vector3`, `Matrix4` and `Box3` objects and spreads frustum vertices into an array every frame (`shadows/cascades.ts:186-200`).
- The frustum key joins the 16 projection matrix elements into a string every frame (`:106`).
- `configureGameEnvironment` allocates a new `Color` every frame when a sky texture replaced the background on the previous frame (`environment/index.ts:9-10`).
- Each frame copies the diagnostics array into the stats (`renderer3d/index.ts:354`).
- These are minor items, listed for completeness.

**F42. `audioState()` copies music on every tick.** Confirmed and minor. The new `audioState()` calls `structuredClone(music)` each tick (`session3d.ts:721-724`). The music state is small, so this is acceptable unless the music state grows.

The costs the brief already names (the per-tick Rapier snapshot round trip, QuickJS script time, and the 600-tick editor checkpoint) are confirmed by the reading above as F18, F20 and F24.

## 5. Suggested content for a performance skill

This list is derived from the findings above. It is not existing guidance.

- **A1. Target.** Ticks run at 60 Hz. Rendering runs at the display rate. Aim for tick p95 under about 4 ms, so that scripts and physics leave headroom inside 16.7 ms, and set frame budgets in the document.
- **A2. Measure.** Run `game bench --json` on the bare document for 2D games and for 3D games without collider assets (until F26 is fixed). Run `game capture --json --assets-dir` for draw calls, triangles and overruns at the busiest tick. Run `benchmark:effects --game … --post-effects` for GPU frame time and post-processing cost.
- **A3. Authoring defaults to change:**
  - Set `castShadow: false` on terrain, ground and distant scenery.
  - Use `count: 2–3` cascades with a `maxDistance` that matches what the player sees.
  - Use `mapSize` 1024 unless close-up shadows look bad.
  - Avoid shadowed point lights.
  - Use `softness` only on emitters near geometry, with tight bounds.
  - Merge repeated props into a few GLBs and chunk large terrain.
  - Use a decimated collision mesh.
  - Use few scripts, keep props small, and keep active scripted scenes under a few hundred entities.
  - Use a static sun with a procedural sky.
  - Use bloom only with a high threshold, and treat `hudWidth` as the render resolution.
- **A4. Checking.** Compare editor fps with standalone fps only with F24 in mind. Read `budget.overruns` from the capture JSON, because nothing fails automatically.
