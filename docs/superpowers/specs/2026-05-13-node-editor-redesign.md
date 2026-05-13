# Node Editor Redesign Spec

**Date:** 2026-05-13
**Status:** Draft, pending review
**Author:** Claude (with Matti)

## 1. Goal

Modernize the NodeTool editor UI — content-forward node bodies, cleaner port/edge styling, a curated left panel, an evolved inspector, and bespoke editing-node bodies — while preserving NodeTool's existing graph engine, execution model, and Python bridge. The redesign reorganizes how nodes present content and how the user configures them — it does **not** change the workflow runtime, the WebSocket protocol, or the node-author API.

**This is the new editor.** No opt-in mode, no preview flag. Each PR replaces a piece of the existing UI directly.

## 2. Non-goals

- **No theme/palette overhaul.** The black canvas, font stack, and color tokens stay. Only port/edge styling and group styling change visually.
- **No credits, cost, or "Run selected" footer.** Commerce surfaces are out of scope.
- **No "Tasks" or "Share" toolbar items.**
- **No backend execution changes.** Existing nodes keep their `process()`/`genProcess()` contracts.
- **No mobile redesign.** This is desktop / Electron / web only.

## 3. Tracks

| Track | Scope summary |
|------|------|
| A | Port + edge polish |
| B | ContentCardBody (parameterized by output type) |
| C | Left-panel quick-access categories |
| D | Inspector evolution + show-as-input toggle |
| E | 9 bespoke editing-node bodies |
| F | Group node label redesign |

## 4. Architecture

### 4.1 Node body routing

`NodeContent.tsx` already chooses a body component by node type. Extend the registry:

```
resolveBody(nodeType):
  if nodeType in BESPOKE_BODY_REGISTRY:        // Track E
      return BESPOKE_BODY_REGISTRY[nodeType]
  if nodeType in CONTENT_CARD_REGISTRY:        // Track B
      return ContentCardBody
  return GenericBody (basic_fields + advanced toggle)
```

The two registries are permanent — they're how nodes opt into a specific body type, not transitional gates. Utility nodes (`Constant…`, `If`, `Loop`, `Map`, control-flow) intentionally stay on the generic body forever.

### 4.2 What stays unchanged

- ReactFlow integration and `BaseNode.tsx`'s outer shell
- `NodeHeader.tsx` (subtle polish only — already close to target look)
- `basic_fields` metadata — already the right split
- `editableDynamicInputs` infrastructure — already supports "+ Add another X"
- Node selection, copy/paste, undo/redo, MiniMap
- Workflow execution, MsgPack protocol, Python bridge
- Existing specialized nodes outside Track E (`CompareImagesNode`, `image_editor`, `sketch`, `CommentNode`)

## 5. Track A — Port + edge polish

### A1. Hover-only port labels

Today: each property field shows a permanent label next to its handle. After this track: handles are subtle colored dots only; labels appear in a tooltip on hover.

- **File:** `web/src/components/node/PropertyField.tsx`, `web/src/components/HandleTooltip.tsx`
- **Behavior:** The property label DOM element gets `visually-hidden` styling. Hover over the handle triggers an existing-style tooltip showing the property name + type.
- **Connected-state exception:** When a property is currently connected, keep the label visible (the user is editing a wired graph and needs to read it without hovering).

### A2. Edge endpoint labels

The static label tags at edge endpoints ("Input*", "Result", "Prompt", etc.) — already present in NodeTool to a degree near connection points; needs polish to render as small floating chips at edge tips.

- **File:** edge renderer in `web/src/core/graph/` (locate via `ConnectionLine.tsx` and ReactFlow edge components)
- **Behavior:** A floating chip near each edge endpoint shows the source/target property name. Only rendered when not overlapping siblings (use ReactFlow's edge label positioning).
- **Conflict avoidance:** If two endpoints are within N px of each other, only the source chip renders; the target chip is suppressed.

### A3. Typed port endpoint chips

Each handle gets a small inline pill containing its type icon (a "T" pill for text, image icon for image, etc.).

- **File:** new `web/src/components/node/TypedPortChip.tsx`, integrated into `PropertyField.tsx`
- **Behavior:** A small (~14×14 px) chip rendered immediately inboard of the handle dot, using `IconForType(propertyType)`. Color from `colorForType(propertyType)`.
- **Interaction:** Pure visual. Tooltip on hover already covers semantics.

### A4. Typed edge coloring

Audit the edge renderer; ensure every edge's stroke color equals `colorForType(sourceHandle.type)`. Today, `ConnectionLine.tsx` (drag-in-progress) uses `colorForType` but the static edges may not.

- **File:** edge renderer in `web/src/core/graph/`
- **Behavior:** Stroke color = `colorForType(source.type)`. Selected edge gets stroke 2px with a subtle outer glow. Unselected: 1.5px.
- **Animation:** Animate edge color transitions on type change (rare, but happens with dynamic property edits).

### A5. Collapsed-state polish

NodeTool already supports `data.collapsed`. Fan-out workflows benefit from small header-only nodes as routing hubs (e.g., a single text prompt fanning out to many image generators). Tighten the collapsed visual:

- **File:** `web/src/components/node/BaseNode.tsx`, `NodeHeader.tsx`
- **Behavior:** When `data.collapsed` is true: hide body completely (`display: none`), header height clamped to ~40 px, ports remain on header strip top/bottom edges and stay hoverable/connectable. Width matches header content width (icon + title), not the previous expanded width.
- **No new collapse trigger needed.** Existing double-click on icon and header context menu already toggle.

## 6. Track B — ContentCardBody

### 6.1 Component shape

`web/src/components/node_types/ContentCardBody.tsx`

```tsx
interface ContentCardBodyProps {
  nodeId: string;
  nodeMetadata: NodeMetadata;
  data: NodeData;
  primaryOutput: OutputSlot;   // determines body variant
  basicFields: string[];       // sub-set of properties rendered inline below preview
}
```

Renders a fixed-size card with three regions:

1. **Header** — already provided by `NodeHeader` (provider icon + title + "..." menu)
2. **Preview area** — variant based on `primaryOutput.type`
3. **Footer strip** — `<DynamicInputButton />` (bottom-left) + primary action `<RunModelButton />` (bottom-right) — optional, present only when relevant

### 6.2 Preview variants by output type

| Output type | Empty state | Populated state |
|------|------|------|
| `image` / `tensor[H,W,C]` | `<CheckerDropzone />` with subtle "Run Model" hint | Full-bleed image, `object-fit: contain`, falls back to `cover` when card width forces it |
| `image_mask` / `alpha` | Black background with white "no mask yet" glyph | Mask rendered against checker bg (alpha) or against source image if a compositing context exists |
| `video` | Checker dropzone with play-icon overlay | `<VideoPlayer />` primitive (see §11) |
| `str` / `text` | Empty multiline area, "Run Model" prompt subtle | Readonly multiline TextField, auto-resizes to card; scroll if overflow |
| `model_3d` | Checker dropzone with cube icon | Static thumbnail; full 3D viewer not in scope |
| `audio` | Reuse existing `AudioPlayer` empty state | `AudioPlayer` (already exists) |

### 6.3 Default card sizes

| Output type | Default width × height (px) |
|------|------|
| `image` (square) | 280 × 280 |
| `image` (variable aspect) | 280 × 320 |
| `video` | 320 × 220 (16:9 + player) |
| `str` / `text` | 320 × 200 |
| `model_3d` | 280 × 280 |
| `audio` | 320 × 120 |

These are applied at node *creation* time (via `nodeFactory` or equivalent on drop). User resize remains available. The defaults exist only to make freshly dropped grids feel uniform.

### 6.4 CONTENT_CARD_REGISTRY initial members

The registry starts with explicit node types so we don't accidentally affect utility nodes. Initial set:

- **Image generators** (~50): all model packages currently registered as `*.GenerateImage*`, `*.TextToImage*`, `*.ImageToImage*` in fal-nodes, replicate-nodes, base-nodes, openai/anthropic/google providers
- **Video generators** (~20): all video model nodes from current packages
- **3D generators** (~10): all 3D-model generation nodes from current packages
- **Text-content nodes**: `Prompt`, `PromptConcatenator`, `ImageDescriber`, `AnyLLM`, `ChatNode`
- **Thin image-edit nodes** without bespoke UI: background-removal, content-aware fill, inpaint, ChatGPT Images, similar single-action nodes

Registry lives in `web/src/components/node_types/contentCardRegistry.ts`. Authors of new nodes opt in by adding their node type.

### 6.5 Dynamic input button

`web/src/components/ui_primitives/DynamicInputButton.tsx`

- Renders as `+ Add another <thing>` at bottom-left of the card body
- Hooks into existing `editableDynamicInputs` flow: clicks call `addDynamicProperty(nodeId, baseName)` which already exists for nodes that opt in
- Variants by node:
  - "+ Add another image input" — image-multi-input generators
  - "+ Add another text input" — text concatenators / multi-prompt nodes
  - "+ Add variable" — `Prompt` and template nodes (variables are dynamic string properties referenced as `{{name}}` in the prompt body)

### 6.6 Run Model button

`web/src/components/ui_primitives/RunModelButton.tsx`

- Renders at bottom-right when the node is a "leaf executable" (has a `RUN_MODEL` capability in metadata, or matches the generator pattern)
- Click triggers a single-node run via existing `WorkflowRunner.runNode(nodeId)` or equivalent (verify exact API name during implementation)
- Disabled / loading states reflect node execution status (already in `useStatusStore`)
- Text content: "Run Model" by default; nodes may override via metadata (e.g., "Recalculate mask" for Masks Extractor)

### 6.7 Provider icon coverage

Audit `IconForType` / brand icon registry. Ensure every provider/category has a crisp SVG mark at 20×20 and 14×14:

- OpenAI, Anthropic, Google, xAI, Mistral, Groq, Ollama
- Stability AI, Black Forest Labs (Flux), Recraft, Ideogram, Mystic
- All image/video/3D model providers currently registered
- Text content (`T` glyph), Mask (alpha glyph), 3D (cube glyph), Video (filmstrip glyph), Audio (waveform glyph)

Missing icons added under `web/src/components/icons/providers/`.

## 7. Track C — Left-panel quick-access

### 7.1 Current state

Today: `PanelLeft.tsx` is the workflow/asset panel; node picking happens via `NodeMenu.tsx` (full registry browser, modal or always-open). The full registry is good for *finding*, but the left panel needs to surface **curated quick-access** instead.

### 7.2 Target

The left edge gets a **two-column structure**:

- **Sidebar rail (~56 px wide)**: icon stack — Search / History / Workflows / Image / Video / 3D / Quick access / [more]
- **Main column (~280 px wide)**: content for the selected sidebar category, with a search input at top + a 2-column tile grid of node cards

Each tile shows:
- Provider/brand icon (~32 px)
- Display name
- Optional `New` chip if `node.is_new`
- Drag to canvas to drop, or click to drop at viewport center

### 7.3 Categories (initial)

| Sidebar item | Content |
|------|------|
| Search | Global node search (current `NodeMenu` collapsed into this column) |
| History | Recently-used nodes (already implemented as `RecentNodesTiles.tsx`) |
| Workflows | Saved workflows + favorites |
| Image Models | All Track-B image generators |
| Video Models | All Track-B video generators |
| 3D Models | All Track-B 3D generators |
| Quick access | Prompt, Import, Export, Preview, Import Model, Import LoRA — useful primitives |
| Tools | Editing nodes (Levels, Crop, Channels, Blur, Compositor, Painter, etc.) |

### 7.4 Component layout

```
PanelLeft.tsx (resizable, existing)
├── Sidebar (new: QuickAccessSidebar.tsx) — icon stack
└── Main column (selected category)
    ├── CategorySearchBar.tsx
    └── QuickAccessGrid.tsx — 2-col tile grid
        └── QuickAccessTile.tsx — single node card
```

### 7.5 Full registry browser

Stays available as a secondary panel or modal triggered from the Search sidebar item. Reuses existing `NodeMenu.tsx` rendering. The full menu does **not** disappear — it becomes the deep-search entry point.

### 7.6 Configuration

Categories defined in `web/src/config/quickAccessCategories.ts` as a static array of `{ id, label, icon, filter }`. Tags-based filter against node metadata (`namespace`, `category`, `tags`).

## 8. Track D — Inspector evolution

### 8.1 Current state

`Inspector.tsx` exists and renders the selected node's full property list with `Property*` field renderers. This track shifts the *split* between what renders on the node body vs. inspector.

### 8.2 Property visibility model

For each property on the selected node:

- **Basic field** (in `metadata.basic_fields`): renders inside the node body (existing behavior) **and** in the inspector
- **Advanced field** (not in `basic_fields`): renders **only** in the inspector. On the node body, hidden unless either:
  - The user explicitly **promotes it to an input handle** (see §8.4), OR
  - The graph has an edge wired to it (existing auto-reveal in `NodeInputs.tsx`)

Today's "show all advanced" toggle on the node is removed — the inspector becomes the canonical place to find advanced props.

### 8.3 Inspector layout

```
Inspector.tsx
├── Header: provider icon · node title · "..." menu
├── PropertyList (basic first, then advanced, grouped)
│   └── For each property:
│       ├── Label · (i) info tooltip · [⇢ show as input] toggle
│       └── PropertyField (existing renderers)
└── (footer reserved; intentionally empty — no cost/run section)
```

Info tooltip `(i)` reads from existing `property.description`.

### 8.4 "Show as input handle" toggle

New per-property toggle in the inspector, available on advanced properties only:

- Off (default): property is inspector-only
- On: property gets an input handle on the node, rendered like any other input port

Implementation:

- **Data model:** `nodeData.exposedInputs: string[]` — list of advanced property names the user has promoted
- **Storage:** persisted with the node, restored on load
- **Rendering:** `NodeInputs.tsx`'s existing visibility predicate (currently `isBasicField || isConnected || showAdvancedFields`) becomes `isBasicField || isConnected || exposedInputs.includes(propertyName)`
- **Auto-promotion:** when an edge is created against an unexposed advanced property, automatically add it to `exposedInputs` so the handle persists even if the edge is later removed (the user clearly wanted it as an input)
- **Demotion:** explicit toggle-off removes it from `exposedInputs`. If currently connected, prompt confirmation (would disconnect edge).

### 8.5 Inspector files

- `web/src/components/Inspector.tsx` — evolve in place
- `web/src/components/properties/PropertyVisibilityToggle.tsx` — new
- `web/src/stores/NodeData.ts` — extend with `exposedInputs`
- `web/src/components/node/NodeInputs.tsx` — extend visibility predicate

## 9. Track E — Bespoke editing-node bodies

Nine nodes get bespoke bodies under `web/src/components/node_types/editing/`. Each is a self-contained component receiving the standard node props.

### E1. Levels (`LevelsBody.tsx`)

- Top: full-bleed image preview
- Middle: histogram (RGB / luma) — render with HTML canvas from output image data; cached via `useMemo`
- Bottom: R/G/B sliders (input black point / gamma / white point per channel) + reset
- Backend: maps to existing `Curves` node; we may add a `Levels` alias node or extend `Curves` metadata with `display_as: levels`
- Histogram computation: web-worker if image > 1024² to avoid blocking

### E2. Crop (`CropBody.tsx`)

- Top: image preview with **draggable crop rectangle overlay** (corner + edge handles)
- Bottom: aspect-ratio dropdown, W/H inputs, "Reset" button
- Backend: existing `CropNode` in base-nodes
- Crop UI: implement with simple mouse-event handlers; render rectangle as SVG overlay on top of `<img>`

### E3. Channels (`ChannelsBody.tsx`)

- Top: image preview rendered as selected channel only (R, G, B, A, luminance)
- Bottom: channel picker (segmented control)
- Backend: maps to existing `ExtractChannel` or adds a thin `Channels` node if missing

### E4. Blur (`BlurBody.tsx`)

- Top: image preview
- Bottom: Type dropdown (Box / Gaussian / Motion) + Size slider 0–100
- Backend: existing `Blur` / `GaussianBlur` nodes — verify present

### E5. Compositor (`CompositorBody.tsx`)

- Top: composited image preview (full-bleed)
- Middle: "Add another layer" button
- Bottom: per-layer mini-rows with thumbnail · opacity slider · blend-mode dropdown · visibility toggle
- Backend: new `Compositor` node (or extend existing image-overlay node) accepting `List[Image] + List[BlendMode] + List[float opacity]`
- Single most complex bespoke body; consider splitting into `CompositorBody.tsx` + `LayerRow.tsx`

### E6. Masks Extractor (`MasksExtractorBody.tsx`)

- Top: tabbed view — Image · Mask (segmented control to toggle which is shown)
- Bottom: "Recalculate mask" action button
- Backend: extract-masks model node (SAM / Bria / similar); verify per provider

### E7. Rotate-and-Flip (`RotateAndFlipBody.tsx`)

- Top: image preview with applied transform
- Bottom: rotate slider (0/90/180/270 + free), flip H/V toggles, "Reset"
- Backend: existing `RotateNode` and `FlipNode` — may combine into a single front-end body that targets one node type with both rotate and flip params

### E8. Resize (`ResizeBody.tsx`)

- Top: image preview (current size displayed as overlay or below)
- Bottom: W and H number inputs with **lock-aspect toggle** chain icon
- Backend: existing `ResizeNode` in base-nodes

### E9. Painter (`PainterBody.tsx`)

- Top: paintable canvas overlaying the source image
- Side toolbar: brush size, opacity, color, eraser
- Bottom: undo/redo, "Background fade" toggle (controls source-image opacity behind paint), "Clear" button
- Backend: a `Painter` node that outputs an alpha mask (paint = mask) stored as an image asset. May extend the existing sketch-related node if one exists, or add a new node.
- Reuses existing `web/src/components/sketch/` infrastructure (hardened recently via cfc7b6702).

### E10. Bespoke registry

`web/src/components/node_types/editing/bespokeRegistry.ts` maps node type → body component. Ships one node at a time; partial rollout is fine because un-registered nodes fall through to `ContentCardBody` then to the generic body.

### E11. Backend coverage check (pre-implementation)

Before each bespoke body lands, confirm the backend node exists with the right outputs:

| Body | Backend node | Status |
|------|------|------|
| Levels | `Curves` (rename or alias OK) | Exists |
| Crop | `CropNode` | Exists |
| Channels | extract-channel | Verify |
| Blur | `Blur` | Verify in `lib-image-filter.ts` |
| Compositor | New `Compositor` | **Need to add** |
| Masks Extractor | SAM / Bria | Verify per provider |
| Rotate-and-Flip | `RotateNode` + `FlipNode` | Combine FE-side |
| Resize | `ResizeNode` | Exists |
| Painter | New `Painter` node | **Need to add** |

Two confirmed backend additions (`Compositor`, `Painter`). Both small (image-in, image/mask-out), no model dependency.

## 10. Track F — Group node redesign

`web/src/components/node/GroupNode.tsx` already exists with title input + ColorPicker + RunGroupButton + BypassGroupButton.

**Changes:**

- **Header becomes a pill at top-left**, not a full-width bar. ~32 px tall, padded, colored fill matching the group's color, white text. Sits "outside" the group's bounding box (overlapping the top-left corner).
- **Background fill** uses the group color with ~12% opacity instead of the current `c_bg_group` token; **border removed** (or reduced to a 1px subtle line at the same color, 30% opacity).
- **Inline title edit** stays — double-click pill to edit.
- **Color picker** remains accessible via "..." menu on the pill; no UI change to the picker itself.

Reuses existing `ColorPicker`, `RunGroupButton`, `BypassGroupButton` unchanged.

## 11. Shared primitives

New primitives in `web/src/components/ui_primitives/`:

| Primitive | Purpose | Used by |
|------|------|------|
| `VideoPlayer.tsx` | Embeddable video player with custom controls (timestamp, seek, play/pause, speed) | ContentCardBody (video variant) |
| `CheckerDropzone.tsx` | Empty-state preview with optional drop handling | ContentCardBody (empty states) |
| `DynamicInputButton.tsx` | `+ Add another X` bottom-left button | ContentCardBody, editing-node bodies |
| `RunModelButton.tsx` | Bottom-right primary action button | ContentCardBody, some editing-node bodies |
| `TypedPortChip.tsx` | Small type-icon pill at handle endpoints | PropertyField, edge endpoints |
| `EdgeEndpointLabel.tsx` | Floating chip near edge endpoints showing property name | Edge renderer (if not coverable via existing label slot) |

All primitives follow `STRATEGY.md` rules: no raw MUI components outside `ui_primitives/` or `editor_ui/`, theme tokens only, default size constants live next to the primitive.

## 12. PR sequence

Each PR replaces a piece of the existing UI directly. No flag, no parallel paths — each one ships as the new default.

Sequence keeps risk low: small isolated tracks first; biggest visual changes once the primitives are in place; bespoke editor nodes last (one PR each).

1. **PR 1 — Track A (ports + edges)** — A1, A2, A3, A4, A5 in one PR (all small, all related)
2. **PR 2 — Track F (Group node)** — Pill header + tinted bg
3. **PR 3 — Shared primitives** — VideoPlayer, CheckerDropzone, DynamicInputButton, RunModelButton, TypedPortChip (no behavior change yet; just the primitives)
4. **PR 4 — ContentCardBody scaffold** — Component + image variant; registry starts with ~3 generator nodes to validate
5. **PR 5 — ContentCardBody variants** — Add video, text, 3D variants
6. **PR 6 — CONTENT_CARD_REGISTRY full rollout** — Add all generator + text-content nodes
7. **PR 7 — Track C (left panel)** — QuickAccessSidebar + categories; full registry remains via Search
8. **PR 8 — Track D (inspector)** — Property visibility model + show-as-input toggle + `exposedInputs` data field
9. **PR 9..17 — Track E (one node per PR)** — Resize, Rotate-and-Flip, Crop, Blur, Channels, Masks Extractor, Levels, Compositor, Painter (cheapest first, Painter last)

Backend additions (`Compositor` and `Painter` nodes) ship in their respective Track-E PRs as paired backend + frontend changes.

If a PR introduces a visible regression, it gets reverted on its own — each PR is independently revertable because tracks are narrow.

## 13. Risks & open questions

### 13.1 Risks

- **`CONTENT_CARD_REGISTRY` scope drift.** If we add too many nodes too fast, we'll hit edge cases (nodes with multiple outputs, weird input shapes, side-effects). Mitigation: PR 4 ships with ~3 nodes; PR 6 expands only after manual QA per generator family.
- **Bespoke node bodies vs. backend changes.** Compositor's frontend depends on a new backend node with a specific input/output shape. If the backend shape needs revision after FE work, double cost. Mitigation: define the node API in the PR before building the body.
- **Edge rendering audit (A4) may surface a bigger refactor** than expected if static edges aren't using `colorForType` for non-trivial reasons (e.g., theme-aware mixing). Mitigation: spike A4 first; if it's > 1 day, split into its own PR.
- **`exposedInputs` migration on existing workflows.** Workflows saved before this change have no `exposedInputs` field. Migration: treat missing field as `[]`. No backfill needed; existing connected edges already auto-reveal via the `isConnected` predicate.
- **Default card sizes vs. existing saved workflows.** Defaults apply only to *new* node placements. Existing workflows keep their saved sizes. No migration risk.
- **Painter integration with `sketch/` infrastructure.** Recent fix (cfc7b6702) hardened sketch persistence, but Painter's data shape (alpha mask output) may not match what `sketch/` produces. Mitigation: read sketch code carefully before designing Painter's data flow.
- **No flag means no rollback short of revert.** Each PR must be small enough to revert cleanly. The PR sequence is structured for this.

### 13.2 Open questions

- **OQ-1:** The `Prompt` node with `{{variable}}` templating — does this template grammar already exist in NodeTool, or are we inventing it? **Action:** Search for template-string handling before Track B implementation.
- **OQ-2:** Edge endpoint labels (A2) — what happens for nodes with many handles in a tight column? Auto-suppress beyond a count threshold (e.g., > 6 inputs)? **Suggestion:** Yes, suppress and show only on hover/selection.
- **OQ-3:** Generator nodes with multiple outputs — `ContentCardBody` displays *one* primary preview. Which output is "primary"? **Suggestion:** First output in `metadata.outputs` unless metadata marks one as `is_primary: true`. Add this metadata field if not present.

## 14. Files affected (summary)

### New

- `web/src/components/node_types/ContentCardBody.tsx`
- `web/src/components/node_types/contentCardRegistry.ts`
- `web/src/components/node_types/editing/{LevelsBody,CropBody,ChannelsBody,BlurBody,CompositorBody,MasksExtractorBody,RotateAndFlipBody,ResizeBody,PainterBody}.tsx`
- `web/src/components/node_types/editing/bespokeRegistry.ts`
- `web/src/components/node/TypedPortChip.tsx`
- `web/src/components/ui_primitives/{VideoPlayer,CheckerDropzone,DynamicInputButton,RunModelButton,EdgeEndpointLabel}.tsx`
- `web/src/components/node_menu/{QuickAccessSidebar,QuickAccessGrid,QuickAccessTile,CategorySearchBar}.tsx`
- `web/src/components/properties/PropertyVisibilityToggle.tsx`
- `web/src/config/quickAccessCategories.ts`
- `web/src/components/icons/providers/*` (icon fill-in pass)
- Backend: new `Compositor` and `Painter` nodes in `packages/base-nodes/src/nodes/`

### Modified

- `web/src/components/node/BaseNode.tsx` (collapsed polish, body routing)
- `web/src/components/node/NodeContent.tsx` (body resolution)
- `web/src/components/node/NodeHeader.tsx` (subtle polish only — already close)
- `web/src/components/node/NodeInputs.tsx` (`exposedInputs` visibility predicate)
- `web/src/components/node/PropertyField.tsx` (hover-only labels, type chip)
- `web/src/components/node/GroupNode.tsx` (pill header + tinted bg)
- `web/src/components/Inspector.tsx` (visibility toggle, info tooltips, layout)
- `web/src/components/panels/PanelLeft.tsx` (new sidebar + main column)
- `web/src/core/graph/` edge renderer (typed colors, endpoint labels)
- `web/src/stores/NodeData.ts` (`exposedInputs` field)

### Unchanged (explicitly)

- Workflow runtime (`packages/kernel`, `packages/runtime`)
- Node SDK (`packages/node-sdk`)
- Python bridge
- WebSocket protocol
- All existing nodes outside Track E and outside the registry
- Theme palette, fonts, top-level layout
