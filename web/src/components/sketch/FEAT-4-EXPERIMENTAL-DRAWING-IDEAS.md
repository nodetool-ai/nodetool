# Experimental Drawing Ideas

> Wild or ambitious sketch/editor ideas, sorted by use-case rather than technical category.
> These are intentionally exploratory. They should be filtered through the same core rule as the rest of the editor: keep ordinary raster workflows fast, predictable, and optional.

## 1. Clean Inking and Line Confidence

- `stroke grammar`: infer whether the user is sketching, inking, hatching, or drafting from the first part of a stroke and adapt assistance mid-stroke
- `editable recent-stroke transforms`: after finishing a stroke, allow quick cleanup sliders such as smoother, straighter, more tapered, or more calligraphic
- `spline leash`: write onto a temporary spline while dragging so freehand curves stay extremely smooth without forcing a shape tool
- `style-preserving assist`: keep the user’s wobble/taper personality while still cleaning up the stroke
- `latent stroke variations`: draw once, then scrub between cleaner, shakier, more expressive, or more technical versions

## 2. Technical Drawing, Panels, and Precision Work

- `guide ghosts`: project likely continuation lines such as parallel, perpendicular, tangent, and perspective directions while drawing
- `construction mode`: create non-paint construction strokes such as center lines, vanishing guides, circles, and scaffolds
- `perspective-aware assist`: once vanishing points exist, snap or softly attract strokes toward perspective-correct directions
- `panel-border intelligence`: detect likely comic panels and help keep borders parallel, evenly spaced, and consistent
- `rail mode`: let the brush lock onto temporary guides or inferred paths without needing full analysis of existing artwork

## 3. Hatching, Repetition, and Parallel Marks

- `echo / chorus strokes`: draw one stroke and automatically generate parallel offset siblings with controllable spacing and variation
- `parallel-line helpers`: use a temporary guide or last committed direction to keep repeated strokes parallel
- `multi-stroke intent`: detect that the user is building a hatch field and switch into spacing/parallel assistance for a series of marks
- `spacing controls for repeated marks`: enforce or suggest even spacing across hatching, speed lines, or decorative line bundles

## 4. Shape Cleanup from Freehand Input

- `shape recognition while drawing`: rough rectangle, ellipse, arrow, speech bubble, or panel border can be recognized and offered as a clean version
- `smart fill + edge completion`: infer a likely closure when the user nearly encloses a shape, then create a fillable region
- `rough-to-clean conversion`: keep the original line, but offer a cleaned geometric version as a replacement or overlay

## 5. Organic Flow, Hair, Fur, Cloth, and Motion

- `stroke field painting`: paint local direction fields so later strokes follow the surface flow of hair, fabric, smoke, grass, or fur
- `magnetic contour assist`: softly attract strokes toward nearby silhouettes, mask edges, or curves without fully snapping
- `gesture continuation`: if the user starts a sweep or arc, predict and extend the motion in a smooth but controllable way

## 6. Smart Guidance and Contextual Help

- `assistant brush copilot`: non-blocking suggestions such as “looks like hatching, enable parallel mode?” or “looks like panel border, snap to 45?”
- `contextual guide suggestions`: surface temporary guides only when stroke behavior strongly suggests they would help
- `local artwork attraction`: optionally attract strokes to nearby edges, boundaries, or dominant directions in the active layer

## 7. Expressive Brushes and Simulation

- `brush behaviors as a stack`: compose assist/effect stages like `lazy -> angle snap -> taper -> jitter -> echo -> texture`
- `brush physics worlds`: nib drag, bristle split, viscosity, gravity, friction, and paper tooth for highly characterful mark making
- `dynamic brush personality`: one tool that can shift between marker, nib, dry brush, and technical pen behavior through a few high-level controls

## 7.1 Preset Discovery and Authoring UX

- `large preset browser`: imagine a dedicated menu with roughly 20 live previews per page so users can browse visual behaviors quickly instead of tuning abstract sliders first
- `preset pages by use-case`: organize pages such as inking, technical drawing, hatching, particles, geometry, organic flow, and experimental/fx
- `preview-first selection`: each preset should show a tiny animated or stroke-based preview rather than only names and parameter lists
- `favorite / recent presets`: make it easy to pin a few reliable looks while still exploring the larger library
- `preset variation controls`: after picking a preset, expose only a few high-value knobs such as strength, snap, spacing, density, physics amount, or style intensity
- `node-based authoring later`: once the shared architecture is stable, allow users to build custom variations by combining available techniques in a graph-like editor
- `authoring graph concept`: users could mix modules such as assist, geometry, taper, echo, particle emission, field response, material, and post-process cleanup
- `ship as curated first, open later`: start with hand-designed presets and only introduce user-authored graphs after the underlying modules and preset format are mature
- `keep authoring separate from sketching`: the future node-based system should feel like a preset/workflow editor, not something that clutters the everyday paint UI

### 7.2 Small Architecture Anchor

- keep three layers separate: `input/assist`, `stroke generation`, and `render/material/simulation`
- define presets as data that reference shared modules, so the browser, runtime, and future node editor all speak the same format
- make each module small and composable, e.g. assist, guide, geometry, echo, particles, material, post-process
- let the runtime execute a curated subset first; the future node-based editor should assemble the same modules rather than invent a second system
- keep preview generation isolated from commit/render logic, so large preset menus and live thumbnails do not tangle the main paint path

### 7.3 PBR Materials and Web-Friendly Material Formats

- `PBR stroke materials`: allow strokes or stroke meshes to use lit material presets instead of only flat color, e.g. chrome ink, chalk, plastic paint, ceramic glaze, holographic line, wet enamel
- `glTF/GLB as long-term material source`: use web-friendly PBR standards as inspiration or import source later, while keeping an internal simplified preset format first
- `2.5D material rendering`: combine stroke geometry or pseudo-depth with roughness, metallic, normals, emissive, clearcoat, and sheen for richer lighting response
- `material preset browser`: show these materials as live previews in the same large preset menu, grouped as a visual family rather than exposing raw PBR parameters first
- `internal material schema first`: define a simplified preset model for the editor, then later support import/conversion from more standard web formats such as glTF materials
- `node-based authoring fit`: in the longer term, material modules should be mixable with assist, geometry, particles, and post-processing in the future graph-based variation system
- `supported material ideas`: metallic marker, wet ink, ceramic glaze, velvet pastel, glass edge, neon gel, glitter paint, holographic foil, wax crayon, brushed aluminum, lava/crackle, translucent plastic
- `PBR channels worth exposing later`: base color, metallic, roughness, normal, emissive, clearcoat, sheen, transmission, specular, height/parallax, and simple environment response
- `layer-level materials`: eventually let whole layers behave like lit surfaces, not only individual strokes, so material workflows can apply to fills, masks, and generated geometry too
- `stroke-level materials`: the opposite direction should stay possible as well, where one stroke family carries its own material identity independent of the layer base color
- `material + geometry pairing`: some presets should combine ribbon/tube/bevel geometry with materials, because lighting becomes much more convincing once strokes have pseudo-depth or real mesh structure
- `preview-first workflow`: the user should mostly choose these by look, not by understanding PBR terminology; names, thumbnails, and grouped families matter more than raw channels
- `web format compatibility`: use glTF 2.0 / GLB ideas as the long-term bridge because they are browser-friendly, standardized, and already aligned with modern PBR concepts
- `internal conversion layer`: imported web materials should be normalized into the editor's own preset format so rendering, preview, and node-based authoring are not tightly coupled to one external schema
- `curated import scope first`: start with a small supported subset of material semantics rather than promising every glTF material extension immediately
- `environment and lighting presets`: materials will only shine if lighting is part of the system too, so later presets may bundle environment maps, rim light, directional light, or simple studio looks
- `2D to 2.5D bridge`: even in a mostly flat editor, normals, bevels, and signed-distance-style depth hints can make strokes feel materially rich without requiring full 3D scenes
- `future authoring graph role`: materials should behave like one module family among others, so users can mix path assist + geometry + material + particles + post-processing into one preset or authored variation

## 8. AI / Semantic Cleanup

- `semantic cleanup`: commands like “make this more architectural”, “clean this like comic ink”, or “regularize these hatch marks”
- `stroke beautification as a post-process`: keep the original stroke but allow AI-assisted cleanup passes over selected marks
- `intent-aware correction`: recognize repeated panel borders, perspective lines, or construction marks and offer corrections in bulk

## 9. Safety Rules for Wild Ideas

- keep every assist optional and easy to bypass mid-stroke
- prefer soft attraction over hard snapping unless the user explicitly asks for rigidity
- never hide the raw input completely; the user should always feel in control
- build new behavior on shared `strokeAssist` or similarly reusable seams instead of per-tool hacks
- treat complex existing-artwork analysis as a later phase; first versions should rely on current stroke, explicit guides, or simple recent context

## 10. Architecture Direction for Expandability

- keep input guidance separate from paint rendering: `PaintSession` should consume filtered points, while engines stay focused on stamping pixels
- grow `strokeAssist` as a small pipeline of reusable stages such as `stabilize`, `lazy`, `snap`, `echo`, and `guide`, rather than baking all behavior into one class
- represent assists with clear typed settings and presets, so tools share one schema and UI instead of inventing per-tool flags
- prefer composition over inheritance: new behavior modules should be pluggable units with a tiny interface like `beginStroke`, `update`, `endStroke`
- isolate explicit guide sources from inference sources: temporary rulers, perspective guides, and symmetry data should be separate from future “smart” predictors
- keep “analysis of existing artwork” in its own optional layer so the basic assist pipeline can stay deterministic and cheap
- add lightweight debug/visualization hooks early, so guide lines, lazy-brush leash, snap targets, and predicted paths can be inspected without polluting production code
- preserve a strict fallback path: when assist is off, point flow should behave as close as possible to raw input so debugging remains simple
- store recent-stroke metadata in a narrow, well-defined structure if needed later, instead of letting tools poke directly at each other’s runtime state
- if experimentation grows, split the stack into `strokeAssist/` submodules such as `core`, `stages`, `guides`, `predictors`, and `presets`

## 11. Shader-Heavy Possibilities in Recommended Order

### 11.1 Start with overlays and preview-only rendering

- render assist overlays on the GPU: lazy-brush leash, guide ghosts, snap rays, perspective helpers, and predicted continuation paths
- preview multiple candidates at once, e.g. parallel lines, taper variants, or continuation curves, without committing pixels
- keep stroke intent and assist decisions on the CPU first; use WebGPU mainly for fast preview, compositing, and heavy visual feedback

### 11.2 Add geometric stroke rendering

- use shaders for echo/chorus previews: multiple offset stroke candidates, spacing previews, and taper variants are a strong fit for GPU rendering before committing pixels
- move toward GPU stroke meshing: ribbons, spline strips, tubes, dashed paths, variable-width bands, and calligraphic geometry
- accelerate non-destructive post-stroke transforms so cleanup, beautification, and variation scrubbing feel immediate

### 11.3 Add richer brush materials and repeated geometry

- move brush-shape evaluation toward GPU for expensive experimental brushes such as textured nibs, bristle simulation, smudge-like previews, and dense repeated marks
- explore procedural materials on strokes such as chalk, chrome, hologram, neon, velvet, or liquid ink
- treat this as a rendering/material layer, not a replacement for the shared stroke semantics
- later, support PBR-like stroke or layer materials with simplified web-friendly schemas and eventual glTF/GLB material import paths

### 11.4 Add particles and fields

- particle brushes: sparks, dust, smoke, droplets, embers, pollen, foam, stars
- use compute shaders for local field generation if features like flow painting, magnetic contour assist, or edge attraction are added later
- let strokes seed or modify vector fields so later strokes can follow hair, fur, cloth, smoke, grass, or water flow

### 11.5 Add physics-style simulation

- spring/rope/ribbon brushes, drag, viscosity, pooling, paper absorption, and nib flex
- soft-body or cloth-like marks for cartoon smears, stretched ink, or draping lines
- keep this behind clearly separate tools or modes so ordinary sketching stays predictable

### 11.6 Add fractals and recursive systems

- fractal brush growth for lightning, roots, coral, vines, veins, snowflakes, or ornament
- recursive decorative pattern generation from a stroke seed
- distance-field based contour growth, recursive ripples, and procedural expansion effects

### 11.7 Add 2.5D and 3D space

- pseudo-3D strokes with depth, normals, lighting, parallax, and shaded ribbon geometry
- draw paths that can be projected into or interpreted in 3D space
- use spatial guides, planes, and vanishing systems to connect freehand marks with 3D-aware behavior

### 11.8 Rules for keeping shader work sane

- keep a strict CPU fallback and shared semantic model, so WebGPU changes only how results are previewed or rendered, not what the editor means by a stroke
- avoid hiding core logic inside shaders too early; if guidance rules live only in shader code, the system gets harder to test, debug, serialize, and port
- use WebGPU first where it gives obvious leverage: high-frequency visual feedback, repeated geometry, field visualization, and preview-only effects
- if the feature family grows, mirror the CPU-side structure with a GPU-side layer such as `guides`, `preview passes`, `brush materials`, `simulation`, and `field visualization`, rather than one giant experimental shader file

## 11.9 Product Direction for Presets and Custom Variations

- use the GPU to power a large preset picker with many small live previews per page, so users can browse behaviors visually
- treat presets as serialized combinations of shared modules, not one-off hardcoded brush types
- design the preset format so the same building blocks can later feed a node-based authoring tool
- keep the authoring graph modular: assist/input, guide logic, stroke geometry, particle emission, materials, simulation, and post-process stages
- prefer a curated library first, then let advanced users remix the same modules into custom presets and save/share them

## 12. Most Promising First Experiments

- `echo / chorus strokes`
- `guide ghosts`
- `shape recognition from freehand`
- `perspective-aware assist`
- `editable recent-stroke transforms`
- `style-preserving assist`
