# Sketch Editor Roadmap

> **Status**: the transform-aware foundation is in place; Phase 1 helper-tool / UX items and many transform foundations are shipped (see `SKETCH_FEATURES_DONE.md`). Next focus: move/transform consolidation, editor session seams, then transform-advanced modes and later phases.
> **Last updated**: 2026-04-10
> **Execution note**: this is the active sketch roadmap/backlog. Completed checklists are archived in `SKETCH_FEATURES_DONE.md`. `REFACTOR-SKETCH-APP.md` is supporting context; `REFACTOR-WEBGPU-TASKS.md` is no longer the active checklist.

## Principles

- keep code clean, modular, and focused by responsibility
- keep the document canvas fixed; off-canvas layer content must survive editing, history, and serialization
- prefer shared transform-aware infrastructure over ad hoc per-tool fixes
- treat WebGPU as the primary document renderer in Electron; keep Canvas 2D only for explicit helper paths where it is still the better tool
- keep ordinary raster workflows cheap and predictable
- run sketch-focused tests during normal iteration, not full app tests
- when changing shortcuts, edit src/components/sketch/SHORTCUTS.md
- **harden before extending**: make core models and helpers solid with regression tests before adding new features on top of them

Task labels used below:

- `[impl]` implementation task
- `[test]` test-only task
- `[impl+test]` implementation plus regression coverage
- `[test-first]` write the proving test first, then fix code if the test exposes a gap

## Immediate `SketchEditor.tsx` Refactor Candidates

`SketchEditor.tsx` is materially better after the subscription-splitting work, but it still concentrates bootstrap, tool-mode side effects, shell wiring, and editor-session orchestration in one place. Do these before piling more behavior into the editor shell.

Completed refactor items (lifecycle hook, tool chrome, color router, store action bundles, URI resolution, preview-boundary tests, editor session layer, transform UI adapter, editor-shell module, command-surface hook, and related tests) are archived in `SKETCH_FEATURES_DONE.md`.

## Immediate `SketchCanvas.tsx` Refactor Candidates

`SketchCanvas.tsx` is much smaller than before, but it still mixes transient preview ownership, hook-bridge setup, and canvas chrome/layout in one place. Keep this refactor narrow and only extract seams that already want to exist.

- [x] [impl+test] extract a dedicated transform-preview bridge from `SketchCanvas.tsx` so preview-map ownership, active-layer preview bridging, redraw/invalidate policy, and startup texture invalidation stop living inline beside compositing and pointer wiring. this should line up with the editor task to remove the parallel preview channel used by transform UI
- [x] [impl+test] extract a canvas interaction-orchestration hook or bridge so the shared refs and the current `useCompositing` / `useOverlayRenderer` / `usePointerHandlers` setup stop living in one component body. focus especially on the container/canvas refs, modifier refs, cursor-position tracking, and the current circular-style wiring comments in `SketchCanvas.tsx`
- [x] [impl] extract canvas stack + chrome presentation from `SketchCanvas.tsx` so stacked canvas JSX, canvas/cursor style computation, resize handles, and the info bar stop living beside orchestration logic. keep the extracted piece presentational: no new state ownership, just props for already-derived layout/chrome data

## Active Roadmap

Shipped backlog for this section (startup transform preview bug, selection mask CPU path + invert fix, store subscription hardening, selection performance plan notes) lives in `SKETCH_FEATURES_DONE.md`. Medium/long-term selection-mask GPU ideas are listed there for when profiling warrants them.

## TOP PRIORITY - DISPLAY / INTERACTION CORE

Treat this as the shared seam behind startup paint, transform preview, buffered-stroke visibility, and runtime/bootstrap display updates. Keep it narrow: centralize the contract for "a visual change becomes visible" without building a broad new interaction framework.
Current diagnostic clue: on a freshly opened editor, move/transform preview and click-only brush taps can fail while a real dragged stroke succeeds and then "unlocks" later preview/tap behavior for the session. treat this as evidence that the shared startup redraw / pending-commit / display-target seam is dropping first interactive frames, not as proof of a tool-local bug.

- [x] [test-first] add a focused scenario regression matrix for the shared display seam: fresh-open click-only brush tap, first dragged brush stroke, move drag, transform drag, startup `imageReference` / hydrated layer, WebGPU bootstrap, and Canvas2D fallback. these should prove first-interaction visibility before tool-specific fixes
- [x] [impl+test] introduce one small shared display/frame coordinator seam that owns immediate vs deferred redraw entry points, pending buffered-stroke drain, and the active display target decision (`bootstrap` vs real display). move only the already-shared policy here; do not fold unrelated tool/session logic into it
- [x] [impl+test] make startup interaction readiness explicit with one narrow state/contract (for example: first interactive frame ready) so preview-only and click-only paths do not rely on implicit timing between hydration, runtime bootstrap, and redraw scheduling
- [x] [impl+test] replace ad hoc redraw calls with one typed redraw request surface that records reason and urgency (`transform-preview`, `buffered-stroke-commit`, `paint-move`, `hydration-complete`; `immediate` vs `raf`) so future fixes can be reasoned about from one place
- [x] [impl] document the display invariants in one local seam comment / mini design note: preview transforms are visual-only, pending stroke commit must be drained before frames that claim to show committed pixels, bootstrap/display switching must not drop the first interactive frame, and first-open tap/preview must work without a prior stroke
- [x] [impl+test] unify the display-facing contract for transient visual changes so transform preview and buffered-brush preview use the same central visibility semantics even if their internal state remains separate. goal: one understandable answer to "what changed, and why should it be visible now?"
- [x] [impl+test] add lightweight dev-only tracing for this seam (`preview-set`, `frame-requested`, `pending-stroke-drained`, `frame-composited`, `hydration-complete`, backend/target) so temporal startup bugs can be debugged without scattering temporary logs across tools and runtimes

## NEXT UP - MOVE AND TRANSFORM TOOL

Do these before more transform-heavy work. The goal is to reduce brittleness in `MoveTool` + `TransformTool` and nearby overlay tools by sharing only the stable gizmo primitives, not by forcing all tools into one generic interaction framework.
Try to implement these tasks with only as much shared core as needed. It is fine to change core helpers and adapt focused tests when that removes real brittleness, but avoid introducing a broad new interaction framework just to satisfy one tool.
- [ ] [test-first] `1.` restore first-interaction rendering on a freshly opened editor: move/transform preview must update layer pixels before any prior stroke, and a click-only brush tap must paint immediately instead of requiring a real drag first. investigate the shared startup redraw seam before changing tool-specific logic. likely area: preview/tap paths currently depend on deferred `requestRedraw()` / pending-commit drain behavior while drag paths also hit stronger dirty/immediate composite paths. cover both WebGPU bootstrap and Canvas2D fallback, including `imageReference` / hydrated startup layers
- [ ] [impl+test] `2.` make the startup redraw path deterministic for preview-only and click-only interactions. the first transform preview frame and first buffered-brush commit must not be dropped because bootstrap/display targets, pending rAF state, or pending stroke merge timing are not ready yet. prefer the smallest shared fix in redraw scheduling / preview bridge / compositing bootstrap rather than per-tool hacks
- [x] [impl+test] `3.` unify move/transform preview ownership so compositing, gizmo drawing, and transform UI all read one live preview source instead of today's parallel channels (`transformPreviewByLayerIdRef` vs active-layer preview singleton). either route both tools through one existing preview-session contract or remove the duplicate UI-only path entirely, but do not introduce a broader new interaction framework. dragging must not show stale top-bar/context-menu numbers, mismatched gizmo position, or pointer-up jumps, including startup/image-hydration cases and layers with existing translation, scale, rotation, non-zero raster origin, or off-canvas raster bounds
- [x] [impl+test] `4.` harden spring-loaded move (`Ctrl`/`Cmd` move while another tool stays active) so modifier-driven `interactionTool` changes cannot desync preview state from `TransformTool` session baseline/cancel logic. likely area: these temporary tool swaps do not run the same activation/deactivation lifecycle as real tool switches. after the modifier-drag finishes, the moved layer must keep the committed transform, move gizmo state must clean up correctly, and later transform cancel/reset must not restore stale pre-move state
- [x] [impl+test] `5.` harden move/transform gizmo geometry around one explicit resolved-bounds contract. likely area: `MoveTool` already derives extents from resolved raster bounds while `TransformTool` still prefers smaller `contentBounds` for gizmo sizing. decide one rule for visible bounds vs backing raster bounds; avoid fallback-to-document-size behavior; cover `contentBounds`, expanded raster bounds, rotated/scaled layers, and `imageReference` startup cases with focused regressions
- [x] [test-first] `6.` investigate transform preview-vs-commit parity at the lowest stable seam, centered on reconcile/bake-to-pixels rather than a broad rendering rewrite. start with focused regressions that isolate preview compositing, reconcile/bake output, and runtime display paths separately, then only add the smallest fix that matches the failing seam. treat bootstrap/backend promotion as a regression scenario instead of the assumed root cause. likely area: `reconcileLayerToDocumentSpace()` still computes from raw canvas size/transform more directly than the resolved preview path. rotating/scaling semi-transparent pixels must not introduce edge halos, distorted alpha, stripe artifacts, or commit-only visual shifts, including layers with non-zero raster origin / expanded raster bounds

Non-goal for this pass: multi-layer transform targeting, advanced transform modes, pivot UX, and broader gesture abstractions beyond what is required to stabilize the current single-layer move/transform path.
Done when the first transform preview frame and first click-only brush tap work in a freshly opened editor, move and transform share one preview story, spring-loaded move cannot poison transform cancel/reset, gizmo bounds come from one resolved contract, and preview/commit images match for the covered regression cases.

Completed transform-core groundwork for shared gizmo primitives and narrow follow-up hardening has been moved to `SKETCH_FEATURES_DONE.md` so this section stays focused on the still-open move/transform work.

## PHASE 1 - Architecture Stability Before Transform-Heavy Work

Sections **1.1** (helper-tool architecture) and **1.2** (correctness / UX fixes) are complete. Checklist and notes: `SKETCH_FEATURES_DONE.md`.

## PHASE 2 - Transform Foundation

Sections **2.1** (transform, zoom, selection), **2.2** (lifecycle shortcuts), completed **2.3** / modifier-key rows, and shipped **2.4** context-menu entries are archived in `SKETCH_FEATURES_DONE.md`.

### 2.3 - Advanced transform modes and modifier rules

Do not start these until the `NEXT UP` hardening pass is done. Preview ownership, spring-loaded move lifecycle, resolved gizmo bounds, and preview-vs-commit parity all belong to that earlier pass; this section starts only after those seams are stable.
- [ ] [impl+test] add a minimal transform-targeting flow, not a generic multi-tool selection framework: optional auto-select toggle for `TransformTool`; clicking opaque pixels targets the topmost visible transformable layer; `Shift+click` adds/removes layers from the transform target set; the transform gizmo, transform UI, and live preview must use one shared bounds source for the targeted set. do not assume layers-panel multi-select is already the correct transform-target model unless their semantics are made intentionally identical

- [ ] support rotate behavior, including `Shift` snapping and pivot-point changes
  - **Partial:** Rotation via dedicated handle above top-center is implemented. Shift snaps to 15° increments via `snapAngle()` in `computeRotateTransform()`. Remaining: user-adjustable pivot point (currently always layer center).
- [ ] [impl+test] expand transform hit policy only if it can stay local to transform gizmo layout/hit-testing: allow rotate when dragging just outside the box/near scale handles, add an explicit pivot handle, and support snapping the pivot to stable anchor points such as corners/edge handles. keep this built on the same resolved geometry/hit-test seam as the box/handles above, and do not spread it into a generic cross-tool gesture system unless repeated evidence demands it
- [ ] support distort behavior on corner handles
- [ ] support skew behavior on side handles
- [ ] support perspective behavior
- [ ] add options for perspective, skew, and related advanced modes in the transform UI
- [ ] add warp mode
- [ ] support repeat last transformation and repeat-on-copy workflows if the core transform model still supports them cleanly

Modifier-key target behavior to preserve while implementing the items above:

- [ ] `Ctrl` / `Cmd` -> independent vertex control (`Distort` on corners, `Skew` on edges)
- [ ] `Shift` -> constrain (proportional scale, 15-degree rotation snap, axis-lock distortion)
  - **Partial:** Proportional scale (Shift on corner handles) and 15° rotation snap (Shift while rotating) are implemented. Remaining: axis-lock distortion (requires distort mode which does not exist yet).
- [ ] `Ctrl+Shift` / `Cmd+Shift` -> skew on sides, constrained distort on corners
- [ ] `Ctrl+Alt+Shift` / `Cmd+Option+Shift` -> perspective
- [ ] cursor position determines behavior: outside box = rotate, inside = move, on handle = transform
  - **Partial:** Inside box → move and on handle → transform are implemented via `hitTestHandles()`. Remaining: outside box → rotate (currently returns `null` / no interaction).

### 2.4 - Selection context menu

- [x] add a selection-tool right-click context menu entry for `Select Inverse`
- [x] add a selection-tool right-click context menu entry for `Deselect`
- [x] add a selection-tool right-click context menu entry for `Reselect`
- [x] add a selection-tool right-click context menu entry for `Layer via Copy`
- [x] add a selection-tool right-click context menu entry for `Layer via Cut`
- [x] add a selection-tool right-click context menu entry for `New Layer...`
- [x] add a selection-tool right-click context menu entry for `Free Transform`
- [x] add a selection-tool right-click context menu entry for `Transform Selection`
  - **Done:** Added `Transform Selection` menu entry in `SketchCanvasContextMenu.tsx` with `HighlightAltIcon`. Currently disabled (grayed out) — the `onTransformSelection` prop is optional and wired but no backend implementation exists yet. The entry will enable when transform-selection infrastructure is implemented.
- [x] add a selection-tool right-click context menu entry for `Fill`
- [x] add a selection-tool right-click context menu entry for `Stroke`
- [x] add a selection-tool right-click context menu entry for `Select Inverse`
- [x] add a selection-tool right-click context menu entry for `Deselect`
- [x] add a selection-tool right-click context menu entry for `Reselect`
- [ ] fix selection `Free Transform` - should transform the selection, not the layer
- [x] add a selection-tool right-click context menu entry for `Transform Selection`
  - **Done:** Added `Transform Selection` menu entry in `SketchCanvasContextMenu.tsx` with `HighlightAltIcon`. Currently disabled (grayed out) — the `onTransformSelection` prop is optional and wired but no backend implementation exists yet. The entry will enable when transform-selection infrastructure is implemented.
- [x] add a selection-tool right-click context menu entry for `Fill`
- [x] add a selection-tool right-click context menu entry for `Stroke`
- [ ] fix `Layer via Copy` - not yet implemented
- [ ] fix `Layer via Cut` - not yet implemented
- [ ] submenu for selection-tool right-click context menu entry for `New Layer...` - new layer entries as in photoshop 

Deferred selection-context-menu items:

- [ ] deferred: `Select All Layers`
- [ ] deferred: `Save Selection...`
- [ ] deferred: `Make Work Path...`
- [ ] deferred: `Refine Edge`

### 2.5 - FEATURES
- [ ] Layers: add option to merge selected, in right click menu and add icon when multiple layers are selected
- [ ] add one output handle that combines all output layers in a list[image] output
- [ ] improve Layer visibility toggle: allow toggling layer visibility by presing mouse and holding - moving over several layers. the eye icon part of the layer item should be exempt of dragging

### PHASE 3 - SAM SEGMENTATION

- [ ] segmentation/SAM-driven layer creation flows - see web/components/sketch/FEAT-2-SAM.md

### PHASE 4 - ADVANCED FEATURES

### 4.1 - Delayed technical follow-up

These are still real tasks, but they should wait until the Phase 1 groundwork is stable enough that we can make one clean decision instead of adding temporary behavior that will be replaced later.

- [ ] decide whether layer thumbnails should remain raw `Layer.data` previews or move to resolved/effected runtime previews; delay until preview semantics and layer-panel perf budget are explicit
- [ ] centralize snapshot/export/readback flow further and reduce unnecessary encoding/readback work; delay until the document-output contract stops moving
- [ ] rework alpha-lock and dirty-region behavior once the shared session + tool boundaries settle; delay until ordinary editing parity is stable
- [ ] decide blur/adjustments backend from profiling and correctness, not from a blanket "everything must be GPU" rule; delay until the shared CPU-backed tool paths are clean
- [ ] move blur and/or adjustments fully to GPU only if profiling shows a clear gain worth the added complexity
- [ ] add visual regression checks if manual smoke checks stop being sufficient; delay until current semantics are stable enough that snapshots will be trustworthy
- [ ] document color/alpha/HDR rules more formally once effect semantics, working-space rules, and export behavior stop moving

### PHASE 5 - FX LAYER

- [ ] add stackable FX layers under each layer as the long-term replacement for destructive adjustments
- [ ] first FX-layer slice: draggable/reorderable per-layer FX stack, toggle on/off, live preview, not baked into layer pixels, starting with combined hue/saturation/contrast and exposure
- [ ] support stacking multiple FX layers under one layer and define how they interact with groups, masks, exports, and future blend/effect ordering
- [ ] replace the provisional CSS-filter semantics with explicit effect semantics before locking in public FX behavior for exposure, lightness, or future presets
- [ ] add curves as a first-class effect with typed control-point or LUT data rather than forcing it into scalar adjustment semantics
- [ ] decide whether the first true exposure / tonemapping slice stays fully SDR or introduces HDR-capable intermediate passes to preserve highlight headroom before final mapping down
- [ ] add true exposure and professional tonemapping FX only after working-space, dynamic-range, and export semantics are explicit
- [ ] add bloom / glow / light accumulation style FX once the core non-destructive effect stack is stable

### PHASE 6 - IMPROVE PAINT AND SELECT

- [ ] make a plan for a brush engine
- [ ] build a more programmable/extensible brush system on top of the shared paint/session seams
- [ ] brush engine: webgpu shaders, physics, fluids, particles, ...
- [ ] brush engine idea: google museum close up of brushes to sample from
- [ ] brush engine: modal with grid selection for brushes and area / toggle to test brushes quickly on a test canvas
- [ ] brush engine: add speed param to shapee brush width - faster = thinner
- [ ] brush engine: add feature to shape strokes after finishing a stroke: e.g. fade-in-out thickness / opacity with curve

Shipped: adjustable stroke stabilizer (all drawing tools) — see `SKETCH_FEATURES_DONE.md`.

- [ ] brush extensions: smudge/color-smudge
- [ ] define the first narrow goal for lit / PBR-style brushes once the WebGPU runtime and FX pipeline are stable (for example: one lighting model, one material response, and one expected visual use case)
- [ ] decide whether lit / PBR-style brushes need temporary above-display-range internal energy and which intermediate formats that implies
- [ ] build one focused lit / PBR brush prototype only after the goal and intermediate-format decision are explicit
- [ ] selection transform tools + selection move with (shift) arrow keys. note: do not move layer when selection active
- [ ] add AI-assisted tools such as healing or segmentation-driven layer creation


### PHASE 6.1 - HELPERS
- [ ] Gizmos: improve gizmo code: refactor, prepare for more features for transform gizmos and brush preview gizmo
- [ ] Gizmos: brush preview should visualise hardness through a second ring and opacity with a different stroke pattern that is still visible with lowest opacity
- [ ] add Ruler on top and left with pixel, correct origin to canvas, correct  behaviour on zoom
- [ ] Guides: add basic guides system that for small auto-appearing guides relative to canvas and layer extends
- [ ] Crop: after dragging crop area, do not crop immediately. show editable transform gizmo to refine. do crop with icon button to confirm



### PHASE 7 - COLOR PALETTES

- [ ] broader color-system ideas such as global palettes, predefined palettes, image-derived swatches. color palette in own panel. plan in new FEAT-3-COLOR-PALETTES.md before starting

## Future Features - Stroke Assist and Drawing UX

- [ ] evolve the new shared `strokeAssist` system beyond basic smoothing so brush, pencil, and eraser can all use the same guidance model without duplicating logic
- [ ] add more stroke assist presets tuned for real workflows, e.g. technical drawing, comic inking, loose sketching, and pixel-art-safe smoothing
- [ ] add modifier-key behavior for temporary assist overrides, e.g. hold a key to disable snap, force snap, or momentarily switch between freehand and guided modes
- [ ] extend stroke assist with additional low-analysis modes such as softer angle snap, perpendicular snap, and guide/rail style movement that does not depend on parsing existing strokes
- [ ] add optional visual feedback for active assist behavior, e.g. lazy-brush leash, snapped angle hint, or small preset/mode badge in the top bar
- [ ] investigate parallel-line helpers built on current stroke direction or explicit temporary guides, but avoid any version that requires heavy analysis of existing artwork in the first slice
- [ ] revisit smarter assist later: contextual guides, nearby-stroke attraction, or shape-aware snapping, only after the simple shared assist model feels stable and predictable



- [ ] replace the old `ImageEditor.tsx` path with the new `SketchEditor` once parity is strong
- [ ] richer export options such as alpha/opaque/JPEG choices
- [ ] healing brush and other AI-assisted painting tools

----------------------------------------------------------------------------
### Parked - Editor / Input Ideas
----------------------------------------------------------------------------

- [ ] touch/tablet features such as pinch zoom, two-finger pan, and palm rejection
- [ ] rulers and draggable guides
- [ ] make symmetry transformable
- [ ] rotate canvas view
- [ ] wrap-around/tiling mode
- [ ] text layers
- [ ] vector/pen tool
- [ ] portable project import/export, backup/download flows, and richer project persistence
- [ ] clipping masks / clipping groups

----------------------------------------------------------------------------
### Parked - Maybe Later
----------------------------------------------------------------------------
#### HDR / Pro Imaging

- [ ] wide-gamut / professional imaging workflows beyond the first SDR-focused editor slices
- [ ] import/export of higher dynamic range image data and any related document/export semantics
- [ ] HDR display/output support if it becomes a real product requirement rather than just an internal processing convenience

#### Other

- [ ] add canvas-size-from-input-layer. needs some planning
- [ ] plugin/tool extensibility as a product feature
- [ ] investigate PSD/ORA compatibility once the native document model settles
- [ ] PSD/ORA compatibility, SVG IO, and other external format work
- [ ] multi-document or multi-canvas workflows
- [ ] 3D layer support to allow compositing model3D type layers with basic translate, rotate, scale
- [ ] add performance guardrails for huge documents (warnings, history caps, throttling)
- [ ] profile huge-document selection-mask combine paths and decide whether a canvas-compositing fast path is enough before considering worker `OffscreenCanvas` or WebGPU compute; if worker GPU work is ever considered, first define renderer ownership, readback needs, and cross-thread transfer costs

#### Performance
The `combineMasks()` fast-path covers the most common hot path (add/subtract on same-size canvas-origin masks). If profiling later shows selection-mask combine is still too slow on huge canvases, revisit it as an architecture/performance decision rather than a pre-chosen implementation path:

1. **Short term (done):** typed-array fast-path in `combineMasks()`. Single-pass flat loop; no union buffer allocation when masks share size/origin.
2. **Future option:** evaluate a canvas-compositing path for mask combine operations (`globalCompositeOperation` such as `lighter`, `destination-out`, `destination-in`) if CPU loops become the bottleneck. This can be tested on the main thread first; worker `OffscreenCanvas` is a separate choice with extra threading/ownership costs. Any canvas path must handle threshold re-mapping because compositing works on RGBA, not single-channel masks.
3. **Future option:** evaluate a WebGPU compute path only if profiling shows the canvas-compositing path is still not enough for huge documents. Treat this as part of a broader renderer-ownership decision, not a local optimization, because worker/main-thread GPU ownership and readback costs add real complexity.


### AFFINITY IDEAS

1. The Persona system. Instead of burying tools across scattered menus, Affinity splits workflows into dedicated workspaces — Photo, Liquify, Develop (RAW), Tone Mapping, and Export. Each persona shows only the tools relevant to that task, which keeps the interface clean and reduces cognitive overload 
2. Live preview on everything. Filters, adjustments, blend modes, gradients — nearly every operation shows a real-time preview as you adjust sliders or move your cursor
3. Superior snapping and alignment guides. Affinity's snapping behavior is noticeably more intelligent out of the box. Objects snap to edges, centers, spacing, and even distribute evenly with visual guides that appear contextually
## Parked Ideas
4. The Export persona and slice workflow. Exporting in Affinity is far more visual and flexible. You can define multiple slices, assign different formats and resolutions to each, and batch-export everything in one step — all from a dedicated workspace. Photoshop's "Save for Web" and export options feel scattered and dated by comparison.
5. Frequency separation and other pro retouching tools built in natively. Affinity includes a one-click frequency separation setup, built-in inpainting brush, and a stacking tool for focus stacking and HDR — features that in Photoshop either require manual multi-step setups, third-party plugins, or separate applications. Having these accessible directly in the toolbar makes advanced techniques feel approachable rather than arcane.
These are not current priorities, but they should stay visible so they can be revived deliberately later.
6. Boolean operations for vector and raster layers. Affinity lets you add, subtract, intersect, and combine shapes directly on the canvas with intuitive boolean operations — and these remain editable and non-destructive. The way vector and raster tools coexist in the same document without switching to a separate application (the way Photoshop users often bounce to Illustrator) is something users find genuinely freeing.
7. Macro recording that actually feels usable. Affinity's macro system lets you record a sequence of steps, save it, and replay it on other images. The interface for building and managing macros is straightforward and visual, with a simple list of recorded actions you can reorder or delete. Users often find it more approachable than Photoshop's Actions panel, which can feel intimidating with its scripting-heavy logic.
8. Metal and GPU acceleration done well. Affinity was built from the ground up with modern GPU rendering in mind. Canvas panning, zooming, and brush strokes at high resolutions feel buttery smooth because the rendering pipeline was designed for hardware acceleration from day one rather than retrofitted onto older architecture. Users notice this most when working with very large canvases or complex layer stacks.
9. Consistent modifier key behavior and tool options. Small but meaningful — Affinity keeps keyboard modifier behavior (Shift, Alt, Ctrl) consistent and predictable across tools. Tool options appear in a clean horizontal toolbar at the top that updates contextually without overwhelming you with panels. Users who've struggled with Photoshop's sometimes inconsistent or legacy modifier key behaviors find Affinity's approach more logical and easier to build muscle memory around.
### Parked - Nearer-Term

### Shortcuts Behaviour

Shift

Constrains proportions when resizing objects or layers
Locks movement to horizontal, vertical, or 45° angles when dragging
Constrains brush strokes to straight lines between clicks
Adds to selections when using selection tools

Alt / Option

Duplicates an object when you drag it
Samples a source point with the clone brush
Subtracts from selections when using selection tools
Switches to an alternate mode of the current tool (like sampling a color with the eyedropper while painting)

Ctrl / Cmd

Temporarily switches to the Move tool from whatever tool you're currently using
Allows direct selection of layers by clicking on the canvas
Modifies snapping behavior or precision in certain contexts

Shift + Alt / Option together

Resizes from the center while constraining proportions
Combines add/subtract logic in selection tools depending on context

Ctrl / Cmd + Alt / Option together

Adjusts brush size and hardness by dragging on the canvas

----

Shift — Constrain / Add / Extend

Move tool: locks dragging to horizontal, vertical, or 45° diagonal axes
Resize handles: maintains aspect ratio while scaling
Rotate: snaps rotation to 15° increments
Marquee / Lasso / Selection tools: adds to the current selection
Brush / Pencil / Eraser: click once, then Shift-click elsewhere to draw a perfectly straight line between the two points
Pen tool: constrains the next node or handle to 15° angle increments
Line tool: snaps the line to horizontal, vertical, or 45°
Gradient tool: constrains the gradient direction to 15° increments
Crop tool: locks the crop box to its current aspect ratio
Shape tools (rectangle, ellipse): constrains to perfect square or circle

Alt / Option — Alternate mode / Duplicate / Sample / Subtract

Move tool: drag to create a duplicate of the selected layer or object
Resize handles: scale from the center point rather than from the opposite corner
Marquee / Lasso / Selection tools: subtracts from the current selection
Brush / Paint tool: temporarily switches to the color picker to sample a color from the canvas
Clone brush: sets the source sampling point
Eraser: temporarily inverts behavior depending on context
Gradient tool: drag to create a duplicate gradient fill layer
Shape tools: draw the shape outward from the center rather than from a corner
Pen tool: converts a smooth node to a sharp corner by breaking the handle

Ctrl / Cmd — Direct access / Move / Precision

From any tool: temporarily activates the Move tool so you can reposition a layer without switching tools, then release to return to your previous tool
Canvas click: selects the topmost layer under the cursor, allowing direct layer picking without using the layers panel
With brush tools: on some setups, temporarily toggles to the eraser or inverse mode
Node tool: selects individual nodes for direct manipulation
General: used as the primary key for most keyboard shortcuts like Ctrl+Z undo, Ctrl+S save, Ctrl+G group

Shift + Alt / Option — Constrain + Center / Constrain + Duplicate

Resize handles: scales proportionally from the center point, combining both behaviors
Move tool + drag: duplicates the object and constrains the duplicate's movement to an axis
Shape tools: draws a perfect square or circle from the center outward
Selection tools: intersects with the current selection (the overlap of add and subtract logic)

Ctrl / Cmd + Alt / Option — Brush adjustment / Direct manipulation

On canvas drag (horizontal): dynamically adjusts brush size in real time as you move the mouse left or right
On canvas drag (vertical): dynamically adjusts brush hardness or opacity as you move up or down
With Move tool: can select and move layers that are grouped or nested without ungrouping
Node tool: allows asymmetric handle adjustment on curve nodes

Ctrl / Cmd + Shift — Grouped constraints

Resize handles: skews or distorts with constraint depending on the tool
Move tool: constrains movement to an axis while also snapping to alignment guides
Used in various keyboard shortcuts for secondary actions like Ctrl+Shift+Z for redo, Ctrl+Shift+N for new layer

All three — Ctrl / Cmd + Shift + Alt / Option

Resize handles: allows perspective-style distortion on the transform box
Rarely needed in daily use but follows the same composable logic where each modifier adds its own predictable behavior to the combination

The underlying design principle is composability. Each modifier always contributes the same semantic meaning regardless of tool, and combining modifiers combines their meanings. Shift adds constraint, Alt adds alternate/center/duplicate, Ctrl adds direct access. If you know what each modifier means individually, you can predict what any combination will do without memorizing it. That composability is what makes Affinity's system feel learnable rather than arbitrary.



## Agent orientation (where things live)

**Base path:** `web/src/components/sketch/`

### Main flow

1. `../node/SketchNode/SketchNode.tsx` hosts the editor inside the workflow graph.
2. `SketchEditor.tsx` composes the editor UI.
3. `SketchCanvas.tsx` mounts the canvas and wires the `sketchCanvasHooks/` bundle.
4. `state/` holds the slice-based Zustand document store; `hooks/` wraps document actions/selectors.
5. `sketchCanvasHooks/` routes pointer/compositing flow into `tools/`, `painting/`, and `rendering/`.

### Folder guide

- `sketchCanvasHooks/` — pointer routing, compositing, overlays, keyboard modifiers, imperative canvas API; key files include `usePointerHandlers.ts`, `useCompositing.ts`, `useTransformPreviewComposite.ts`, `useRedrawScheduler.ts`
- `hooks/` — document/store action hooks; recent splits include `useStrokeLifecycleActions.ts`, `useTransformActions.ts`, `useExportSyncActions.ts`, `useCanvasGeometryActions.ts`
- `state/` — slice-based store under `state/slices/`, composed into `useSketchStore.ts`
- `tools/` — one module per tool plus shared tool types/registration
- `painting/` — draw engines and shared paint math such as `PaintSession.ts`, `CoordinateMapper.ts`, `sampleDocument.ts`, `alphaLock.ts`, `layerBounds.ts`
- `rendering/` — document runtime/compositing; `WebGPURuntime.ts` is the intended primary runtime, `Canvas2DRuntime.ts` plus `rendering/canvas2d/` remain the helper/reference 2D path
- `serialization/` — save/load document and layer payloads
- `types/` — shared TypeScript types

### Useful top-level files

- UI shell: `SketchEditor.tsx`, `SketchCanvas.tsx`, `SketchToolbar.tsx`, `SketchLayersPanel.tsx`, `LayerItem.tsx`, `ToolSettingsPanels.tsx`, `ColorPickerPopover.tsx`
- shortcuts: `SHORTCUTS.md`
- shipped-feature log: `SKETCH_FEATURES_DONE.md`

### Data flow

1. Canvas input enters through `sketchCanvasHooks/`.
2. Tools and painting update preview state, layer buffers, or runtime requests.
3. Store/actions coordinate document state and history.
4. `rendering/` composites for display/export/readback.
5. `serialization/` persists and restores document state.
