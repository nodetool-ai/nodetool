# three.js (WebGLRenderer r170–r185) and real-time game performance: rules

Scope: WebGLRenderer, Rapier (rapier3d-compat 0.19), browser and Electron. The repository installs three `0.185.1`. Every claim marked **[src r185]** was read from `node_modules/three` in this checkout. The same code is at `https://github.com/mrdoob/three.js/tree/r185/src`. Items marked **[r170+]** are version-specific.

## The six fixed bugs mapped to rules

| Bug | Rule that prevents it |
|---|---|
| 1. Physics world serialized each tick for audio | G3, I5 |
| 2. New `FogExp2` each frame | A1, A2 |
| 3. `renderer.compile()` each frame against the canvas while rendering into a composer target | A3, A7 |
| 4. Four 2048 cascades re-rendered each frame over ~1M triangles | C1–C5 |
| 5. Full-scene depth prepass for soft particles | F3 |
| 6. 1280x720 HUD `CanvasTexture` repainted and uploaded each frame | E1, E2 |

---

## A. Program and material cache

Primary sources: [WebGLRenderer.js `setProgram`/`getProgram`](https://github.com/mrdoob/three.js/blob/r185/src/renderers/WebGLRenderer.js), [WebGLPrograms.js](https://github.com/mrdoob/three.js/blob/r185/src/renderers/webgl/WebGLPrograms.js), [WebGLLights.js](https://github.com/mrdoob/three.js/blob/r185/src/renderers/webgl/WebGLLights.js), [Material.js](https://github.com/mrdoob/three.js/blob/r185/src/materials/Material.js), [WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html), [MDN WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

How the cache works **[src r185]**. For each draw, `setProgram` compares cached material state against the current state. On any mismatch it sets `needsProgramChange`. Then `getProgram` calls `programCache.getParameters()` and builds the string `getProgramCacheKey()`. A cache hit skips the GLSL compile, but the CPU still builds parameters and a key string for every material on every draw that mismatches. With hundreds of materials, this repeated work alone can take most of a frame.

The triggers checked in `setProgram` **[src r185]**:
- `material.version` changed. Each `material.needsUpdate = true` increments it.
- `lights.state.version` changed (only for materials with `needsLights`).
- `outputColorSpace` differs from the value the program was built for.
- Instancing, batching, skinning, `instanceColor`, `morphTexture`, or `BatchedMesh.colorTexture` presence changed on the object that uses the material.
- `envMap` identity changed. This includes `scene.environment` for Standard, Lambert, and Phong materials.
- `material.fog === true && materialProperties.fog !== scene.fog`. This is an **object identity** check.
- Clipping plane count or intersection count changed.
- Vertex alphas, tangents, morph target, morph normal, or morph colour presence, or the morph target count changed.
- `toneMapping` differs.
- `lightProbeGrid` presence changed. This check is new in recent releases **[r180+]**.

Rules:

- **A1.** Create one `Fog` or `FogExp2` object at load time and mutate `.color`, `.density`, `.near`, and `.far` in place. A new fog object fails the identity check for every fogged material. Those values are uniforms, so mutating them never recompiles.
- **A2.** Do not switch between `Fog` and `FogExp2`, and do not toggle `scene.fog` to `null` at runtime. The fog type is part of the program key. To "disable" fog, set the density to 0, as the [three.js manual](https://threejs.org/manual/#en/how-to-update-things) recommends: "dummy values like zero intensity lights, white textures, or zero density fog".
- **A3.** The program variant depends on the bound render target **[src r185]**:
  - With the canvas (`_currentRenderTarget === null`), the program uses `outputColorSpace = renderer.outputColorSpace` and `toneMapping = renderer.toneMapping`.
  - With a render target, it uses `ColorManagement.workingColorSpace` and `NoToneMapping`.

  When a material renders to both the canvas and a composer target, it holds two programs. Each switch between them goes through `getProgram` again.
- **A4.** Keep each material on one target class. With an EffectComposer, render everything through the composer and let `OutputPass` apply tone mapping and sRGB. Do not render the same scene materials to the canvas as well. Debug views and minimaps should use their own material instances.
- **A5.** Lights: `lights.state.version` increases only when the light hash changes **[src r185]**. The hash holds the count of each light type, the shadow-casting count of each type, the spot-map count, and the light-probe count. Adding or removing a light, toggling `light.visible`, or toggling `light.castShadow` recompiles every lit material. Animate `intensity` (0 = off) instead. [discoverthreejs tips](https://discoverthreejs.com/tips-and-tricks/) gives the same rule.
- **A6.** Never set `material.needsUpdate = true` per frame, and never assign a new `envMap` or `scene.environment` per frame. Change uniforms (`color`, `opacity`, `roughness`, and so on) instead. Uniforms never need `needsUpdate`.
- **A7.** Call `renderer.compile()` or `compileAsync()` once, at load or level start. Bind the same render target the real frame uses first (`renderer.setRenderTarget(composer.readBuffer)`), then restore it. This prewarms the correct variant **[src r185]**: `getParameters` reads `renderer.getRenderTarget()`. A per-frame `compile()` walks the whole scene. If its target differs from the real render's target, every material flips between variants twice per frame.
- **A8.** Prefer `compileAsync` **[r158+, current in r185]**. It polls `KHR_parallel_shader_compile` for completion instead of blocking. The [docs](https://threejs.org/docs/pages/WebGLRenderer.html) say "it is recommended to use this version of compile() whenever possible". The extension is not Baseline ([MDN](https://developer.mozilla.org/docs/Web/API/KHR_parallel_shader_compile)), so `compileAsync` falls back to blocking on browsers that lack it.
- **A9.** Prewarm every variant that gameplay can reach before play starts. This covers shadow on or off, each light count, instanced versus non-instanced use of a shared material, and skinned versus static. Pay one compile per variant during the loading screen instead of a hitch in play.
- **A10.** `onBeforeCompile`: the default `customProgramCacheKey()` returns `this.onBeforeCompile.toString()` **[src r185]**. Two materials whose closures share source text but capture different values get the **same** program, which produces wrong shaders. Override `customProgramCacheKey()` to return a short string that encodes the values that change the GLSL. Keep it stable, because a key that changes each frame forces a new program each frame.
- **A11.** Changing `renderer.shadowMap.type` at runtime sets `needsUpdate` on every material in the scene **[src r185, r182+ code path]**. Choose the shadow type once at startup.
- **A12.** `Material.type` is static and read-only **[r170+]** ([migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide)). Code that changed `type` to force updates no longer works.
- **A13.** Detection methods:
  - `renderer.info.programs.length` must stay flat during play. Log it each second, because any growth means new variants.
  - Also watch `renderer.info.render.calls` and `.triangles`. Set `info.autoReset = false` and call `info.reset()` once per frame when a frame has several passes, such as a composer or shadows ([docs](https://threejs.org/docs/pages/WebGLRenderer.html)).
  - In a Chrome CPU profile, look for `getProgram`, `getParameters`, `getProgramCacheKey`, or `WebGLProgram` in steady state. Any of these in steady state is a bug.
  - [Spector.js](https://spector.babylonjs.com/) captures one frame and shows `linkProgram` calls, redundant state changes, and texture uploads.
  - Avoid `getError`, `getProgramParameter`, and `get*Parameter` in production, because each one is a sync round-trip to the GPU process ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). Keep `renderer.debug.checkShaderErrors = false` in release builds for the same reason.

## B. Draw calls and per-object CPU cost

Sources: [BatchedMesh docs](https://threejs.org/docs/pages/BatchedMesh.html), [MDN best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices), [three.js forum: optimise rendering](https://discourse.threejs.org/t/how-can-i-optimise-my-three-js-rendering/42251), [discoverthreejs tips](https://discoverthreejs.com/tips-and-tricks/), [Unity: optimizing draw calls](https://docs.unity3d.com/2023.2/Documentation/Manual/optimizing-draw-calls.html), [Object3D source](https://github.com/mrdoob/three.js/blob/r185/src/core/Object3D.js).

- **B1.** Each visible `Mesh` costs at least one draw call, plus uniform uploads, a frustum test, and a matrix update. Shadow passes and depth prepasses repeat the draw call. The CPU cost per draw in WebGL (validation plus the IPC to the GPU process) usually limits performance before triangle count does. Start with a budget of a few hundred draws per frame on integrated GPUs (see J4).
- **B2.** Use `InstancedMesh` for many copies of one geometry and one material (trees, rocks, debris, bullets). Write matrices into the instance buffer and call `instanceMatrix.needsUpdate = true` only when a matrix changed. Use `addUpdateRange` on the attribute for partial uploads **[src r185]**.
- **B3.** Use `BatchedMesh` **[r159+, mature r170+]** for many *different* geometries that share one material. It renders through multi-draw. It has `perObjectFrustumCulled` and `sortObjects`, both `true` by default ([docs](https://threejs.org/docs/pages/BatchedMesh.html)). Set `sortObjects = false` for opaque content when CPU-bound, because sorting runs every frame. Moving a mesh into or out of a `BatchedMesh` or `InstancedMesh` changes its program variant (see A).
- **B4.** Merge static geometry (`BufferGeometryUtils.mergeGeometries`) by **spatial chunk**, not across the whole world. One merged mesh is never culled while any part of it is visible. Merged terrain therefore always draws in full and always enters every shadow cascade ([forum](https://discourse.threejs.org/t/how-can-i-optimise-my-three-js-rendering/42251)).
- **B5.** Frustum culling tests `geometry.boundingSphere` **[src r185 Mesh.js]**. The test is cheap per object but useless for huge meshes. If you deform vertices on the GPU or move instances, recompute bounds or set a correct bounding sphere. Do not disable `frustumCulled` globally.
- **B6.** `renderer.render` calls `scene.updateMatrixWorld()` each frame when `scene.matrixWorldAutoUpdate` is true **[src r185]**. This walks every object.
  - For static objects, set `matrixAutoUpdate = false` and call `updateMatrix()` after edits.
  - For static subtrees, also set `matrixWorldAutoUpdate = false`.
  - A cleaner approach is to drive transforms from the sim snapshot and call `updateMatrixWorld()` once.
- **B7.** Do not call `scene.traverse`, `getObjectByName`, or `getObjectsByProperty` per frame. Build typed lookup arrays when entities spawn or despawn, then iterate those arrays.
- **B8.** Sort cost: `renderer.sortObjects` (default `true`) sorts the opaque, transmissive, and transparent lists each frame **[src r185 WebGLRenderLists]**. Opaque objects sort front-to-back by material and program to reduce state changes. With few objects the sort is cheap. With thousands of tiny objects, batch them first.
- **B9.** Uniform upload cost scales with the material count multiplied by the uniform count. Share material instances. Many `Mesh` objects can reference one material, and three.js skips re-uploading when the program and material are unchanged. Unity's SRP Batcher works on the same principle of "as few shader variants as possible" ([Unity SRP Batcher](https://docs.unity3d.com/2023.2/Documentation/Manual/SRPBatcher.html)).
- **B10.** Hide objects with `visible = false` instead of removing and re-adding them. Never hide a light this way (see A5).

## C. Shadows

Sources: [WebGLShadowMap.js](https://github.com/mrdoob/three.js/blob/r185/src/renderers/webgl/WebGLShadowMap.js), [LightShadow.js](https://github.com/mrdoob/three.js/blob/r185/src/lights/LightShadow.js), [WebGLRenderer docs: shadowMap](https://threejs.org/docs/pages/WebGLRenderer.html), [CSM addon docs](https://threejs.org/docs/pages/CSM.html), [migration guide r182](https://github.com/mrdoob/three.js/wiki/Migration-Guide), [discoverthreejs tips](https://discoverthreejs.com/tips-and-tricks/).

- **C1.** Cost model: each shadow map re-renders every `castShadow` object inside its light frustum with a depth material. A point light renders 6 cube faces. N cascades means N full caster passes. The work is (caster draws + caster triangles) × maps. The fragment fill cost is the map size squared. One 2048² map is 4.2M texels, and four of them are 16.8M texels per frame.
- **C2.** Make shadows update on demand:
  - Use `renderer.shadowMap.autoUpdate = false` plus `needsUpdate = true` when something moves.
  - Per light **[src r185]**, use `light.shadow.autoUpdate = false` and `light.shadow.needsUpdate = true`. Use this to update far cascades every Nth frame (staggered) while the near cascade updates each frame.
- **C3.** Use caster hygiene:
  - Terrain, large static ground, and distant scenery should usually only `receiveShadow`.
  - Small props that cast tiny shadows should not cast.
  - Particles, the HUD, and the sky should do neither.
  - Use a low-poly proxy mesh as the caster (via layers or a separate invisible caster mesh) for high-poly models.
- **C4.** Fit the shadow camera tightly. Texel density is the map size divided by the frustum extent. A loose `shadow.camera` wastes resolution and includes more casters. The CSM addon's default `maxFar` is **100000** ([docs](https://threejs.org/docs/pages/CSM.html)). Set it to the real shadow distance (for example 300–1500 m for a flight sim). Use 2–3 cascades, not 4. Reduce the map size of far cascades if you split the lights yourself.
- **C5.** CSM addon rules: `csm.update()` must run each frame before `render`. `setupMaterial()` patches each material through `onBeforeCompile`, so call it once per material, never per frame. `updateFrustums()` is needed only after camera or CSM settings change. The addon is WebGL-only. `CSMShadowNode` is for WebGPURenderer.
- **C6.** `PCFSoftShadowMap` is deprecated **[r182+]**. `WebGLShadowMap` logs a warning and switches to `PCFShadowMap`, which is now soft (Vogel disk plus interleaved gradient noise). Set `PCFShadowMap` directly. The type change triggers a full-scene recompile (A11). After an upgrade, re-tune `bias` and `normalBias` ([forum report](https://discourse.threejs.org/t/shadow-pixelation-issue-in-three-js-0-182-0/88746)).
- **C7.** For static worlds, bake the static shadows into lightmaps or AO. Then cast only from dynamic objects into a small, tight frustum that follows the player.

## D. Post-processing

Sources: [EffectComposer.js](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/postprocessing/EffectComposer.js), [UnrealBloomPass.js](https://github.com/mrdoob/three.js/blob/r185/examples/jsm/postprocessing/UnrealBloomPass.js), [WebGLRenderer docs](https://threejs.org/docs/pages/WebGLRenderer.html), [MDN best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices), [discoverthreejs tips](https://discoverthreejs.com/tips-and-tricks/), [migration guide](https://github.com/mrdoob/three.js/wiki/Migration-Guide).

- **D1.** Each full-screen pass costs at least one read and one write of the whole target. At 3456×2234 (a 16" Retina display at DPR 2), the target holds 7.7M pixels, and a half-float RGBA target is about 62 MB of traffic per pass. Count passes, and fuse them where possible (one "uber" pass for colour grading, vignette, and grain).
- **D2.** `EffectComposer` creates its targets as `HalfFloatType` by default **[src r185]**. This is needed for HDR bloom and tone mapping in `OutputPass`. It is 2× the bandwidth of RGBA8. Keep it for HDR, and use RGBA8 targets for LDR-only passes.
- **D3.** `UnrealBloomPass` allocates 1 bright target plus 5 mips × 2 blur targets, all half-float, with blur kernels of 6–22 taps **[src r185]**. Run bloom at half resolution or lower (`bloomPass.resolution`), or use a cheaper custom bloom with fewer mips.
- **D4.** Cap the pixel ratio: `renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5–2))`, and call `composer.setPixelRatio` with the same value. Better still, render 3D at a dynamic scale (0.6–1.0 of the canvas) and composite the HUD at native resolution. MDN: "Render to a smaller back buffer" by setting `canvas.width/height` while keeping the CSS size.
- **D5.** MSAA versus FXAA and SMAA:
  - Canvas MSAA (`antialias: true`) is cheap on tile-based GPUs (Apple Silicon included), but has no effect once you render into a composer target.
  - For a composer, choose one option: `WebGLRenderTarget({ samples: 4 })` on the composer's render target, or a post AA pass. FXAA is the cheapest. SMAA costs 3 passes and 2 lookup textures. `SMAAPass` no longer takes a width and height **[r175+]**.
  - Never stack MSAA with FXAA or SMAA.
  - Set `antialias: false` on the context when you use a composer.
- **D6.** `OutputPass` should be the last pass and should own tone mapping and the sRGB conversion. `OutputPass` supports `CustomToneMapping` **[r173+]**, and autoClear is off in the output pass **[r174+]**. Leave `renderer.toneMapping` as you set it, because `OutputPass` reads it. Rendering the scene to the canvas as well invalidates the material programs (A3).
- **D7.** Use `invalidateFramebuffer` (or let three.js do it) for depth and MSAA attachments you will not read back. Storing them costs bandwidth on tile-based GPUs ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)).

## E. Textures and GPU memory

Sources: [WebGLTextures.js](https://github.com/mrdoob/three.js/blob/r185/src/renderers/webgl/WebGLTextures.js), [Texture.js](https://github.com/mrdoob/three.js/blob/r185/src/textures/Texture.js), [MDN best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices), [three.js manual: disposing](https://threejs.org/manual/en/how-to-dispose-of-objects.html), [Khronos KTX Artist Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md), [migration guide r170](https://github.com/mrdoob/three.js/wiki/Migration-Guide).

- **E1.** `texture.needsUpdate = true` on a `CanvasTexture` re-uploads the **whole** canvas. That upload often includes a colour-space conversion or premultiply pass and a pipeline flush. MDN: DOM-element uploads "incur a processing pass that will temporarily switch GL Programs internally, causing a pipeline flush". A 1280×720 RGBA canvas is 3.7 MB per upload, plus mipmap generation if enabled.
- **E2.** For a HUD texture:
  - Repaint and upload only when the content changes. Use dirty flags for each widget.
  - Throttle numeric readouts to 10–15 Hz.
  - Prefer DOM or CSS overlays, or SDF text in GPU quads, for fast-changing text.
  - Set `generateMipmaps = false` and `minFilter = LinearFilter` on screen-space textures.
  - Size the canvas to the HUD region, not the full screen.
- **E3.** `Texture.updateRanges` / `addUpdateRange` performs partial `texSubImage2D` uploads **[src r185]**. It works only for `DataTexture`-style `image.data` (RGBA). It does **not** apply to `CanvasTexture`.
- **E4.** Upload textures before drawing or between passes, never in the middle of the frame (MDN). Stage new assets with `renderer.initTexture(tex)` during loading so the first use does not hitch.
- **E5.** Mipmaps:
  - Use them for any texture that is minified in 3D. They cost +33% memory but give a large sampling speed-up and less aliasing.
  - Turn them off for screen-space and UI textures.
  - **[r170+]** Mipmaps are generated whenever `generateMipmaps` is `true`, regardless of the filter. Set it to `false` explicitly when you use a non-mip filter.
- **E6.** Use KTX2/Basis through `KTX2Loader` for colour textures, because they stay compressed in VRAM and are faster to sample. Use ETC1S for albedo and UASTC for normal, roughness, and metalness data (Khronos guide). The memory difference is roughly 4–8× against RGBA8.
- **E7.** Set anisotropy (`renderer.capabilities.getMaxAnisotropy()`, typically 4–8) on ground and runway textures seen at grazing angles. It costs bandwidth, so leave it at 1 elsewhere.
- **E8.** Prefer RGBA8 over RGB8, because RGB8 is often emulated and slow ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). Do not assume float render targets on mobile (check `EXT_color_buffer_float`).
- **E9.** Dispose discipline: three.js never frees GPU resources on its own. Disposing a material does **not** dispose its textures, and render targets and passes have their own `dispose()` ([manual](https://threejs.org/manual/en/how-to-dispose-of-objects.html)). Assert that `renderer.info.memory.geometries` and `.textures` return to their baseline after a level unload.
- **E10.** Budget VRAM per pixel: choose a VRAM budget, divide it by the maximised drawing-buffer pixel count, and cap caches at that ratio on resize ([MDN](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices)). Do not exceed 4096² textures for portability.

## F. Transparency and particles

Sources: [WebGLRenderLists.js](https://github.com/mrdoob/three.js/blob/r185/src/renderers/webgl/WebGLRenderLists.js), [three.js forum: soft particles performance](https://discourse.threejs.org/t/soft-particles-rendering-performance/27610), [forum: soft particles depth](https://discourse.threejs.org/t/points-transparent-textures-depth-artifacts-soft-particles/5927), [Godot: optimizing 3D](https://docs.godotengine.org/en/stable/tutorials/performance/optimizing_3d_performance.html).

- **F1.** Transparent objects sort back-to-front by object, not by triangle **[src r185]**, and cannot be batched by material. Keep the transparent object count low. Draw a particle system as one `Points`, `InstancedMesh`, or `BatchedMesh` with per-particle sorting on the GPU or in a worker only if you need it. Additive blending needs no sorting at all.
- **F2.** Overdraw is the real cost of particles: fragment work equals the screen coverage times the layer count. Use smaller or fewer quads, tight-fit geometry (polygon cards instead of quads with mostly zero alpha), and render particles into a half-resolution target, then composite.
- **F3.** Soft particles need scene depth, but **never re-render the scene for it**. Attach a `DepthTexture` to the main (composer) render target, then sample that texture in the particle pass, which renders after the opaque pass. The forum reports a "significant performance boost" from this approach over a separate depth prepass. You can also skip softness for small or far particles, which handles most cases.
- **F4.** Transparent particles: `depthWrite = false`, `depthTest = true`. With `depthTest` off, particles show through walls. With `depthWrite` on, particles clip each other.
- **F5.** Use `alphaTest` and cutout (opaque) materials for foliage and fences. They stay in the opaque list, are sortable, and write depth.

## G. Garbage collection and allocation

Sources: [discoverthreejs tips](https://discoverthreejs.com/tips-and-tricks/), [MDN: structuredClone](https://developer.mozilla.org/en-US/docs/Web/API/Window/structuredClone), [Chrome DevTools: memory](https://developer.chrome.com/docs/devtools/memory-problems).

- **G1.** Do not allocate in the frame loop. This means no `new Vector3/Quaternion/Matrix4`, no `.clone()`, no array or object literals, no `map/filter`, no closures, and no spread operators. Use module-level scratch objects. GC pauses of 5–30 ms appear as periodic hitches even when the average frame time is low.
- **G2.** Pre-size typed arrays for per-entity data (positions, velocities, render transforms), and reuse event objects from pools.
- **G3.** Never call `JSON.stringify/parse`, `structuredClone`, or `world.takeSnapshot()` in a hot path. Each one is O(world size) per call and allocates garbage of the same size. Answer lookups (for example "where is the listener", or "which body is the engine") from maintained indices or handle maps.
- **G4.** QuickJS boundary: crossing the guest/host boundary costs a marshal for each value. Batch script commands into one call per tick, pass typed-array views or numeric IDs instead of object graphs, and do not expose per-frame object snapshots to scripts.
- **G5.** Check the result with a DevTools Performance recording. Minor GC events must be rare, and the "JS heap" line should be flat without a sawtooth pattern. Use allocation sampling to find the source ([Chrome docs](https://developer.chrome.com/docs/devtools/memory-problems)).

## H. Game loop

Sources: [Gaffer On Games, "Fix Your Timestep!"](https://gafferongames.com/post/fix_your_timestep/), [WebKit bug 236780 (rAF above 60 Hz)](https://bugs.webkit.org/show_bug.cgi?id=236780), [Electron BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window), [MDN best practices (flush and rAF)](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices).

- **H1.** Run the sim at a fixed `dt` (for example 1/60 s) with an accumulator, and render with interpolation `alpha = accumulator / dt` between the previous and current state. Use slerp for quaternions. With a fixed `dt`, physics behaves the same at 30, 60, or 120 Hz, and the result is deterministic and replayable.
- **H2.** Prevent the spiral of death: clamp the frame delta (Gaffer uses 0.25 s) **and** cap the steps per frame (for example 4–5). When over budget, the game slows down instead of locking up.
- **H3.** Drive the loop from `requestAnimationFrame` or `renderer.setAnimationLoop`. Read time from the rAF timestamp, not `Date.now()`. Never assume one callback equals one sim step. Never use `setInterval` for rendering.
- **H4.** On 120 Hz ProMotion displays, Chrome and Firefox call rAF at 120 Hz, which leaves an 8.3 ms budget for each frame. Desktop Safari and WKWebView may cap rAF at 60 Hz. Choices:
  - Render each rAF and keep the sim at 60 Hz with interpolation.
  - Or render on alternate callbacks to hold a stable 60 fps when 120 is not reachable. A steady 60 fps feels better than a rate that jumps between 70 and 120.
- **H5.** Separate the sim from rendering in time: sim (physics plus scripts) → write render transforms → render. Do not let the render code query physics or scripts directly.
- **H6.** Move work to workers in this order: asset decode (KTX2 transcoding already happens in workers, and so does meshopt decode), pathfinding, and procedural generation. Physics can run in a worker only if you accept one frame of latency and transfer typed arrays (`postMessage` with transferables), never object graphs.
- **H7.** In Electron, `backgroundThrottling` defaults to true, so rAF and timers throttle when a window is hidden or occluded. Pause the sim on `visibilitychange`, and resynchronise the accumulator on resume to avoid a catch-up burst.

## I. Physics (Rapier JS 0.19)

Sources: [Rapier colliders](https://rapier.rs/docs/user_guides/javascript/colliders), [Rapier rigid bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies), [Rapier scene queries](https://rapier.rs/docs/user_guides/javascript/scene_queries), [Rapier serialization](https://rapier.rs/docs/user_guides/javascript/serialization), `@dimforge/rapier3d-compat@0.19.3` `pipeline/world.d.ts` in this repository.

- **I1.** Terrain should use a **heightfield**. It uses "much less memory" than a trimesh and suits large terrain. Use a trimesh only for static, non-heightmap geometry, and avoid long, thin triangles. Never put a trimesh on a dynamic body, because it has no interior and objects get stuck in it.
- **I2.** Dynamic concave objects should use a compound of convex pieces (convex decomposition). Use `convexMesh` instead of `convexHull` when the input is already convex, because it skips the hull computation. Round variants of cylinders, cones, and convex shapes are faster than the sharp versions. Round cuboids are slower than plain cuboids.
- **I3.** Keep the collider count low. Merge static colliders by chunk, and use collision groups to drop pairs. The docs say collision groups are preferred because they skip the most computation. Solver groups still compute contacts.
- **I4.** Let bodies sleep, and pass `wakeUp: true` only when needed. Sleeping bodies cost nothing until they wake.
- **I5.** `world.takeSnapshot()` serializes the **whole** world into a `Uint8Array`. It is meant for save files, the network, or rollback, never for per-tick queries. For lookups, keep handle-to-entity maps and read `body.translation()` and `body.linvel()` directly.
- **I6.** CCD is off for dynamic-versus-dynamic pairs by default because it is expensive. Enable it only on fast, small bodies such as bullets or a landing aircraft. CCD is never automatic against trimesh, polyline, or heightfield shapes, so a fast body over terrain needs explicit CCD, substeps, or soft-CCD prediction. A large `softCcdPrediction` increases the number of collision pairs.
- **I7.** Move kinematic bodies with `setNextKinematicTranslation/Rotation`. Never teleport dynamic bodies, because that is non-physical and can create deep penetrations.
- **I8.** Scene queries run against the broad-phase structures that `step()` updates. If you move colliders without stepping, call `propagateModifiedBodyPositionsToColliders()` before querying (0.19 API; the older `updateSceneQueries()` is gone). Filter queries with `QueryFilterFlags` or groups, and prefer `castRay` (first hit) over `intersectionsWithRay`, because cost grows with the number of hits.
- **I9.** Set `world.lengthUnit` to the typical size of an object in world units. Internal tolerances and sleep thresholds scale with it, which matters for metre-scale aircraft over kilometre-scale terrain. Keep `timestep` fixed (H1). `numSolverIterations` defaults to 4. Raise it per body with `setAdditionalSolverIterations` instead of raising it for the whole world.

## J. Profiling method (Chrome and Electron)

Sources: [Chrome DevTools: analyze runtime performance](https://developer.chrome.com/docs/devtools/performance), [MDN EXT_disjoint_timer_query](https://developer.mozilla.org/en-US/docs/Web/API/EXT_disjoint_timer_query), [web3dsurvey: EXT_disjoint_timer_query_webgl2](https://web3dsurvey.com/webgl2/extensions/EXT_disjoint_timer_query_webgl2), [Khronos thread: Chrome re-enabling timer queries after Site Isolation](https://www.khronos.org/webgl/public-mailing-list/public_webgl/1807/msg00034.php), [stats-gl](https://github.com/RenaudRohlinger/stats-gl), [Spector.js](https://spector.babylonjs.com/), [migration guide r169](https://github.com/mrdoob/three.js/wiki/Migration-Guide).

- **J1.** Find which processor limits you first:
  - Halve the resolution. If the frame time drops, you are fill-bound or bandwidth-bound.
  - If it does not drop, you are CPU-bound or vertex-bound.
  - Then disable shadows, post, and particles one at a time.

  This bisection found causes 4–6 faster than reading the code.
- **J2.** CPU: use a DevTools Performance recording (or Electron's DevTools) with "Disable JavaScript samples" off. Sort the Bottom-Up view by self time. In steady state, three.js time should sit in `renderBufferDirect`, `setProgram` (uniforms only), and `projectObject`. It should not sit in `getProgram`, `getParameters`, `compile`, `updateMatrixWorld` on static trees, `traverse`, or a serializer.
- **J3.** GPU time: `EXT_disjoint_timer_query_webgl2` is exposed in desktop Chrome, where it was re-enabled after Site Isolation. It is absent in Safari and on many mobile devices. Feature-detect it and handle `GPU_DISJOINT_EXT`. `stats-gl` wraps it and replaces `GPUStatsPanel`, which was removed **[r169]**. When the extension is missing, use the DevTools GPU track or Xcode's Metal System Trace on the Electron process.
- **J4.** Frame budgets: 16.6 ms at 60 Hz and 8.3 ms at 120 Hz. Plan for about 70% of each, because the browser compositor and GC need headroom. A 60 Hz split: sim and scripts ≤ 4 ms, render submit ≤ 4 ms, GPU ≤ 10 ms. Starting budgets for an M1-class or integrated-GPU target at 1080p:
  - ≤ 300–500 draw calls including shadow passes (`info.render.calls` with `autoReset = false`)
  - ≤ 1–2M triangles drawn per frame including shadow passes
  - ≤ 2–3 full-screen post passes
  - ≤ 512 MB of textures

  These numbers are starting points, not vendor figures. Measure them on your slowest target and enforce them in an automated perf harness.
- **J5.** Measure on the slowest supported hardware (a base M1, an Intel iGPU, or a low-end Windows laptop), not on an M4 Pro. Use the release build with DevTools closed. Run a fixed, scripted camera route for a fixed duration, and report the p50, p95, and p99 frame times (not average FPS). Report `info.programs.length`, `info.memory`, draws, and triangles alongside them.
- **J6.** Use Spector.js for one-frame captures to count `linkProgram`, `texImage2D`/`texSubImage2D`, and redundant `useProgram` calls. Use `chrome://gpu` to confirm hardware acceleration and the ANGLE backend in use.

## K. Asset authoring

Sources: [glTF Transform CLI](https://gltf-transform.dev/cli), [meshoptimizer](https://github.com/zeux/meshoptimizer), [Khronos KTX Artist Guide](https://github.com/KhronosGroup/3D-Formats-Guidelines/blob/main/KTXArtistGuide.md), [three.js LOD](https://threejs.org/docs/pages/LOD.html), [Godot: optimizing 3D (LOD, occlusion)](https://docs.godotengine.org/en/stable/tutorials/performance/optimizing_3d_performance.html), [Godot MultiMesh](https://docs.godotengine.org/en/stable/tutorials/performance/using_multimesh.html), [forum: 168→9 draw calls case study](https://discourse.threejs.org/t/expeditione-how-i-packed-an-interactive-3d-encyclopedia-into-1mb-and-9-draw-calls/90075).

- **K1.** Set polycount budgets for each asset class and enforce them in the pipeline. Example: hero aircraft 30–80k triangles, props 0.5–5k, terrain chunk 8–32k at LOD0. Budget triangles across the whole frame, including the shadow passes (C1).
- **K2.** LODs: ship 2–4 levels for every mesh visible at a distance, using `THREE.LOD` or your own distance bands, with hysteresis to prevent popping. Generate them with `gltf-transform simplify` (meshoptimizer). Use impostors or billboards for far vegetation.
- **K3.** Chunk meshes so culling works. Divide terrain and city geometry into a grid of tiles (for example 256–1024 m for a flight sim), each with its own bounds and LOD. Tiles then frustum-cull, stream, and fall outside the shadow cascades.
- **K4.** Use atlases or array textures so that many props share one material, which allows `BatchedMesh` or merging (B3, B4). Exporters that split a mesh for each material slot multiply the draw calls (the forum case study above).
- **K5.** A `gltf-transform` pipeline:
  1. `inspect`
  2. `dedup`, `prune`, `weld`
  3. `instance` (repeated meshes → `EXT_mesh_gpu_instancing`)
  4. `join` and `flatten` for static content only
  5. `simplify`
  6. `quantize` (`KHR_mesh_quantization` needs no decoder)
  7. `meshopt` (`EXT_meshopt_compression`, which suits animated and morph content better than Draco)
  8. `resize`, then `etc1s` (colour) or `uastc` (normal and data maps) for KTX2

  `optimize` runs these steps in bulk. Its defaults can join and flatten named nodes, so do not use it on assets whose node names gameplay scripts reference.
- **K6.** Author for the renderer:
  - Reuse one material for each surface type.
  - Avoid `DoubleSide` (twice the raster work and the shadow cost).
  - Avoid alpha-blended foliage (use `alphaTest`).
  - Keep morph target and skin counts minimal.
  - Supply tangents only when a normal map exists.

  Each feature toggle is a program variant (A).
