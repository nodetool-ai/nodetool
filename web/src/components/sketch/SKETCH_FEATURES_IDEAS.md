
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

### Affinity Color Palettes
Swatches panel is the core of it. Every document starts with a default palette, and you can create additional palettes scoped to different levels: application-wide (available in all documents), or document-specific (embedded in and travels with the file). You add colors by picking them and clicking "add to palette," or you can auto-generate a palette from the current document — it'll scan the artwork and extract the dominant colors.
Palette formats — Affinity supports importing .ase (Adobe Swatch Exchange) and .aco (Photoshop palette) files, plus its own .afpalette format. So migrating from Adobe workflows is straightforward. You can also export your palettes in these formats.
Color model flexibility — each swatch stores a color in a specific model (RGB, CMYK, LAB, grayscale, or spot). This matters for print work. A palette can mix color models, so you might have some RGB swatches alongside Pantone spot colors. When you apply a swatch, Affinity does the conversion based on your document's color profile if needed.
Global colors are a distinct feature — when you add a color as a "global" swatch, any objects using that swatch update live when you edit it. Similar to how InDesign swatches work. Regular swatches just set the color at the time of application with no ongoing link.
The recent colors row along the bottom tracks colors you've recently used, which is separate from any palette.
Spot colors — Affinity includes Pantone libraries (with the appropriate license) as built-in palettes. They're treated as spot colors for separation purposes in print workflows.

### Affinity + Krita
Core canvas engine:

Non-destructive layer stack with groups, clipping masks, and blend modes (Affinity's model is clean here)
Both raster and vector layers in the same document (Affinity does this well)
Layer effects/styles that are live-editable (drop shadow, stroke, etc.)
Reference images as a first-class concept — pinned overlays that don't affect export (Krita has this, very popular with artists)

Brush engine — lean toward Krita's approach:

Fully customizable brush engine with dozens of parameters (size, opacity, flow, spacing, scatter, rotation mapped to pressure/tilt/velocity)
Brush tip from any stamp texture, not just round/square presets
Stabilizer/smoothing with configurable lookahead — essential for lineart, and Krita's implementation is best-in-class
Brush presets that bundle tip + dynamics + blend mode as a single saveable unit
Smudge/color mixing brushes that simulate wet paint interaction on the canvas

Selection and masking:

Standard marquee, lasso, magic wand, pen path selections
AI-assisted selection (segment anything / edge detection) — this is table stakes now and neither Affinity nor Krita does it particularly well
Quick mask mode for painting selections
Refine edge with hair/fur detection for photo compositing

Non-destructive editing:

Adjustment layers (levels, curves, HSL, color balance, gradient map)
Filter layers that are live and re-editable, not baked (Affinity calls these "live filters")
Smart objects or linked layers — embed a file that updates when the source changes
Layer masks on everything, including groups and adjustment layers

Color system:

Document-scoped and app-scoped palettes (Affinity's model)
Global/linked colors that propagate edits (Affinity)
Palette generation from canvas or imported image
Import/export ASE, ACO formats for Adobe interop
Color history strip always visible
A proper color gamut selector — let artists pick a triangular or shaped sub-gamut to constrain their palette, which is a feature illustrators constantly ask for and nobody ships natively

Transform and warp:

Standard free transform, skew, perspective
Mesh warp and liquify as live/re-editable operations
Content-aware scale (seam carving) — useful for photo work
Symmetry and mirror painting modes (Krita has multiaxis symmetry, very loved by concept artists)

Text:

Basic text tool with standard formatting — don't try to be InDesign
Text on path
Text as a layer that remains editable
Keep it simple here, this is an image editor not a layout app

File handling:

Native format that preserves all non-destructive state
PSD import/export with good fidelity (this is non-negotiable for adoption)
Standard raster exports (PNG, JPEG, TIFF, WebP, AVIF)
OpenEXR and HDR support if you care about VFX/photography users
ORA (OpenRaster) for Krita interop

Workflow features that set you apart:

Snapshotting — save named states you can flip between without undo history (Krita has session-based snapshots, but making them persistent would be better)
Canvas annotations/notes layer that doesn't export — useful for collaboration or personal reminders
Split view showing before/after of an adjustment in real time
Tiled/wrap-around mode for seamless texture painting (Krita has this, invaluable for game art)
Built-in recording of brush strokes as a timelapse (lots of artists want this for social media)

#### ---------------------------------------------------

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
