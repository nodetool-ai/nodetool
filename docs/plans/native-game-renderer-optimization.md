# Native 2D renderer optimization

Improve the Release renderer without changing pixels, light selection, painter
order, input behavior, resource limits, or simulation state. Follow the
[native game rules](../../native/game/AGENTS.md),
[performance workflow](../../.agents/skills/native-game-performance/SKILL.md), and
[development standards](../DEVELOPMENT_STANDARDS.md).

## Evidence and ownership

The supplied Metal measurement used a committed pose at tick 600, 640 × 480,
90 measured frames after 30 warmup frames. Removing offscreen contributions
after selecting the original light set reduced submitted lights from 32 to 11
and measured wall p95 from 16.276 ms to 14.848 ms with identical pixels. This is
a supplied fixed-pose measurement, not an interactive frame-rate result or a
Linux hardware measurement. Reproduce it on the same backend before claiming
a measured improvement.

Implementation belongs in
[`Scene2D.cpp`](../../native/game/src/render/Scene2D.cpp),
[`Scene2D.h`](../../native/game/src/render/Scene2D.h), and
[`GameViewport.cpp`](../../native/game/src/render/GameViewport.cpp).
`Session.cpp` remains outside this change. Freeze the preceding presentation
correctness fixes before capturing the renderer baseline.

## A1: Cull selected lights outside the viewport

`Scene2D::render` derives the world rectangle from the camera center, authored
width and height divided by zoom, then expands one axis to fit the target
aspect ratio. Use these final dimensions, not the unexpanded camera dimensions
or device-independent item size.

The current selection is authored lighting points first, followed by entity
lights in stable ascending distance from the camera until the existing limit
is reached. Keep that selection and its resource-limit error unchanged. Cull
only from the selected sequence. Never fill vacated slots from later entity
lights. Preserve the relative order of remaining lights so floating-point
accumulation order stays unchanged.

The fragment shader computes
`pow(max(0, 1 - distance / radius), falloff)`. Both lighting contracts require a
positive radius and falloff of at least 0.5, so contributions outside the
radius are zero. Entity-light position includes its transformed offset. Its
radius is currently not multiplied by ancestor scale. Preserve that rule.

For conservative intersection, retain lights whose radius-expanded bounds
intersect the world viewport. An axis-aligned rejection is sufficient and
retains corner false positives. Retain equality at an edge. Account for the
float values actually uploaded to the shader and outward rounding of viewport
bounds. If finite bounds cannot be established, retain the light. Do not add a
brightness threshold, alter attenuation, or cull lights before selection.

Required cases include offscreen centers whose radii reach the screen,
edge-touching lights, corner false positives, zoom and aspect changes,
transformed parent offsets, stable equal-distance selection, authored lights
occupying the limit, and excluded entity lights with very large radii. A
culled authored light must not admit an entity light that was previously
excluded.

## A2: Consume committed presentation data without repeated copies

`Session::frame` already supplies `authoredOrder`, `worldTransforms`, camera,
lighting, and backgrounds. `Scene2D::render` currently copies frame entities,
resolves prefabs for ordering, rebuilds the parent transform map, copies the
whole document to overlay scene presentation, and rebuilds asset metadata on
every render.

Use const references to committed fields when present and valid. Keep the
existing reconstruction path for supported older or partial presentation
frames. Do not keep pointers into temporary `Json::value` results. Resolve
fallbacks lazily so the normal path does not construct them. Scene-specific
empty backgrounds and lighting must still override document values.

Do not replace a reconstruction with a committed field until exact image tests
prove identical transforms and ordering for animation, visual overrides,
parents, tilemaps, authored ties, spawned entities, scene changes, and restore.
A frame field may already contain a visual transformation that must not be
applied again by the renderer.

Cache asset sampling, pivot, trim, and dimensions only from immutable prepared
metadata. Bound the cache by the existing admitted asset set. Invalidate on
asset metadata changes, image-set replacement, or renderer reset. Image pointer
identity alone is insufficient if a document edit changes pivot or sampling
without replacing image bytes. Avoid hashing or copying the entire document on
every frame to detect this.

`FrameMailbox::latest` returns a `shared_ptr<const Json>`. The render thread can
retain that owner through synchronization and rendering rather than deep-copy
the committed frame. Keep the empty-frame fallback and existing lifetime
behavior. Copy a new document only when it changes. Do not change mailbox
publication, input capture, error recovery, or the 3D presentation contract as
part of this optimization.

## A3: Repaint and upload the HUD only when its pixels change

The current 2D path calls `paintHud`, converts its image, and uploads the HUD
texture on every render. `paintHud` reads document HUD widget order, kind,
bounds, text, output pixel dimensions, and resolved `{tick}`, `{score}`, and
`{health}` text. It uses a fixed font and style. The legacy 3D fallback also
calls this function. The separate `Scene3D` HUD has its own implementation.

Build the dirty key from resolved widget text and ordered layout/style inputs,
not the whole frame or an unconditional tick. A changed score should not
invalidate a HUD that does not display score. A `{tick}` label must invalidate
when its displayed tick changes. Include pixel dimensions and any font or
media dependency actually read by the painter. Invalidate on renderer/context
reset, HUD texture recreation, image-set replacement, and font environment
changes. Keep only the current key and texture, not an unbounded history.

Share text resolution between key construction and painting so the cache
cannot disagree with substitution formatting. Preserve transparent clearing,
premultiplied format, widget order, button styling, resize behavior, and action
hit testing. Begin with the 2D path. Extend the legacy 3D fallback only after
its existing pixel contracts pass independently.

## A4: Merge adjacent compatible sprite draws

After stable item sorting, `emitQuad` appends six vertices and one batch per
visible quad. Merge only with the immediately preceding batch when asset,
sampler, additive/normal blend mode, and contiguous vertex ranges match. The
vertex shader inputs already carry tint, opacity, world position, and unlit
state, so those per-vertex differences do not require separate batches.

Keep the vertex sequence byte-for-byte unchanged. Do not regroup by texture,
move a batch past another asset, or combine incompatible blend or sampling
state. Keep the HUD in its final position. Retain vertex and item limits.
Counter reductions must correspond to actual QRhi draw calls, not a renamed
report field.

## Verification and measurement

Preserve original and candidate Release binaries and hash the document,
committed frame, prepared asset manifest, shaders, and capture dimensions.
Use the same Qt version, backend, device, and sample count for an old/new pair.
Run one change at a time in A1–A4 order and compare decoded RGBA pixels exactly
on each backend. Cross-backend images need their own comparison baseline.

The existing [render probe](../../native/game/tests/RenderProbe.cpp) accepts:

```sh
game-render-probe --document game.json --frame frame.json \
  --assets-dir assets --capture frame.png --report report.json \
  --width 640 --height 480 --benchmark-frames 90
```

It performs 30 warmup frames, then times command recording, uploads,
submission, and GPU completion through `rhi->finish` at one committed pose.
The final measured frame also requests readback. Report that measurement as
fixed-pose wall time, not pure GPU time, interactive FPS, or simulation tick
time. Keep the existing 4 ms simulation budget separate.

Use the existing `native-game-player2d` pixel suite for lighting, selection,
layer order, blending, sampling, atlas frames, parents, backgrounds, pivots,
trim, visual overrides, and restore. Use `native-game-render-probe-boundary`
for committed-frame admission. Extend their real-render cases for A1 edges,
A2 fallback parity, A3 unchanged/changed HUD sequences, and A4 overlapping
adjacent compatible draws. Prove each new check rejects a deliberate relevant
mutation before restoring the intended implementation. Run Vulkan and OpenGL
under an exclusive GPU lease. Metal requires its own target-machine run.

For A3, verify identical successive frames skip both painting and texture
upload, while each dependency change refreshes the image. For A4, verify fewer
actual draws with identical vertices and pixels. Use temporary counters or
profiling for attribution and remove temporary instrumentation before shipping.

Compare fixed poses from title, busy temple, scene transitions, resized
viewports, and overlapping transparent sprites. Also replay recorded input
through a live player to check cache invalidation while camera, HUD, scenes,
and assets change. Retain exact simulation frame/snapshot parity, normalizing
only session authentication where necessary. Do not change generation, build,
document, or scope fields for the comparison.

After each successful local proof, run the repository's
[mandatory checks](../../AGENTS.md#mandatory-post-change-verification).
Report actual exits and failed budgets. If an optimization changes pixels,
selection, input, or limits, stop and correct it before measuring another
optimization. Software Vulkan results establish correctness and local wall
cost only. Publish hardware performance claims only from the matching device.
