# Web parity checklist

The native editor uses the web editor as its presentation reference. This list
records implemented surfaces and remaining work without claiming full parity.

## Implemented

- Catalog search, metadata inspector, typed ports, node and wire geometry,
  selection, undo, file persistence, server open/save, and workflow Run/Stop.
- Reachable workflow browser with search through loaded pages, project filtering,
  pagination, create, rename, confirmed delete, and open without discarding unsaved work.
  Changing the server cancels stale browser requests and clears its scope.
- Selected-node execution with live constants, full completed-generation reuse,
  computed signatures/TTLs, ordered saved-generation replay and deterministic
  upstream execution on a cache miss. Explicit targets execute. Missing external
  generative outputs block instead of silently running an unselected generator.
  Bounded display previews are never used as executable values.
- Enable/disable selection with one-step undo and persisted `ui_properties.bypassed`.
  Disabled cards and attached wires are marked, and execution excludes them.
- Catalog drag-to-add through native Qt MIME drops, with transformed canvas placement,
  metadata defaults and one-step undo. Click-to-add remains available.
- Whole-graph and selected-node layout through the More menu, using current card
  dimensions and one-step undo. Invalid or read-only documents remain unchanged.
- Persisted lineage links with labeled dotted curves, selection and deletion.
  Link selected connects exactly two nodes through the selection toolbar or More.
  Links follow nested-group movement and zoom, preserve copy/paste and save/reopen,
  and support one-step undo independently of execution edges.
- Compatible-node picking after input/output wire drops on the pane or group
  backdrop and own-handle clicks. Typed/declared ports take precedence over `any`,
  ambiguous ports remain explicit, and search/keyboard/cancel use shared Quick
  primitives. Node creation and connection commit as one undoable document batch.
  Placement uses native card geometry, directional gaps, and vertical clearance.
  Group backdrop drops create root-level nodes.
- Existing-card body drops auto-connect a single compatible port or offer explicit
  choices for multiple static/instance ports. Scalar inputs replace prior wires,
  typed list inputs collect contributors, and untyped slots infer the source type.
  Dynamic output creation takes priority where enabled. Dynamic input fallback
  respects schema-only provider restrictions. Slot creation, exposed-input state,
  and the wire form one atomic undoable edit. Failed cycles leave no orphan slot.
- Metadata-enabled dynamic input/output authoring in the inspector I/O tab.
  Connected-handle rename and port/connection delete each support one-step undo.
- In-card text, multiline, numeric, boolean, and enum editing through shared
  Quick primitives. Expansion preserves drafts, Escape cancels, and commits undo
  once. Connected and handle-only inputs remain noneditable. Scope checks reject
  stale writes after selection, workflow, or server changes.
- Validated generic list, dictionary, record, and JSON property editors.
- Dedicated color palette, no-color, custom hex/alpha, and native color dialog.
  Image dimensions offer the web presets, custom positive integers, ratio lock,
  and swap. Both preserve unknown wrapper fields and support one-step undo.
- Image/audio/video and generic asset property library search, pagination, upload/drop, progress,
  cancel/retry, and authenticated previews. Selection stores full asset IDs in
  canonical media references and supports one-step undo. Media lists append,
  remove, and reorder references while retaining unknown metadata. Multiple
  file uploads commit one ordered append after the complete batch succeeds.
- The shared model picker for language, embedding, image, video, TTS, ASR, music,
  audio-to-audio, rerank, and `hf.*` fields: search, provider groups, favorites and
  recents shared per account, web-matching provider restrictions and node task
  filters, TTS voice selection, key warnings that name the missing key, the web's
  provider setup rows, recommended downloads, download progress over
  `/ws/download`, and typed selection with one-step undo. Row F20 of the
  [inventory](parity-inventory.md) lists the remaining gaps.
- Authorized workflow single/list selection and collection-name selection.
  Workflow lists preserve order and wrapper metadata through add/remove/reorder.
  Loaded-page search and pagination are explicit. Missing selected workflows are
  checked through the authorized get endpoint.
- Live node status, progress, streamed text, results, errors, and image previews.
  Runtime projections do not edit workflow data. Running indicators stop when
  inactive, disconnected, or reduced motion is enabled.
- Run history with bounded text and typed image, video, and audio output.
  Media locators resolve through an authenticated session into private cache files.
- Aspect-preserving image and video surfaces with explicit play/pause, seek,
  clock, mute and volume. Fullscreen video shares its decoder and sink, supports
  Escape, and offers playback speed selection. Audio has a decoded waveform,
  zoom/fit, minimap, looping and seeking. Downloads preserve the resolved bytes
  and their format. Loading, failure and retry are visible.
- In-card audio/video playback through viewport Quick overlays. Controls scale
  with the graph, preserve selection and undo, and stay below inline editors.
  Offscreen or fully covered cards release their players. Metadata selects the primary
  output. History, workflow and account changes stop playback and invalidate
  previous output, including late events from old jobs.

## Remaining

- Specialized subgraph editing, execution and branch overlays,
  grouped history thumbnails,
  and the single-view history pager.
- In-card structured, model, media, workflow, and collection property controls.
  Their supported editors remain in the inspector.
- Media recording, crop/trim, internal library drag payloads, connected upstream-list
  previews, and legacy nested media-list flattening.
  3D, llama.cpp, and Transformers.js model fields, provider setup, recommendations,
  model packs, and model download/install progress.
- Grid-tile hover actions, grid multi-select with compare, batch download,
  copying video/audio info and the library viewer's edit, transform,
  open-workflow and info actions. Mixed collections use native gallery tiles
  instead of every specialized web array renderer.
- Real-platform accessibility, IME, high-DPI, installation, and measured
  large-graph interaction latency acceptance.

Automated checks and their limits are described in the [README](../README.md).

## Canvas authoring evidence

Build the native host and run `ctest --test-dir <build> --output-on-failure`.
`node_editor_layout` covers the layout algorithm. `node_editor_canvas_authoring`
covers host commands, real catalog mouse gestures, Qt viewport drag/drop events,
transformed placement, metadata defaults, selected isolation, invalid payloads,
read-only documents and undo/redo. Set `NODETOOL_CANVAS_CAPTURE_DIR` when running
`node_editor_canvas_authoring_tests` to capture the arranged eight-node fixture
with its selected inspector in dark and light themes. The same fixture writes
`disabled-selected-{dark,light}.png` and
`run-selected-reuse-{dark,light}.png` for the disabled selection and fake-server selected-run reuse state.

Native layout uses deterministic strongly connected component layering and
barycenter ordering. It preserves unknown fields and edges, rejects invalid
geometry with a status message, and fits only after a successful document
command. It differs from web ELK: group resizing, edge routing and
NETWORK_SIMPLEX optimization remain absent. Invalid documents and unsupported
legacy group/comment formats remain read-only. Asset/file drop coverage is described
below. Offscreen mouse and drop tests do not establish cross-window desktop drag
acceptance.

## Canvas asset and file drops

[CanvasDropController](../src/graph/CanvasDropController.cpp) attaches to the
native viewport drag/drop path. It accepts local file URLs and the checked-out
web's `asset` / `assets-multiple` payloads in
`application/x-nodetool-drag`, plus their legacy MIME keys. Native catalog MIME
continues through its existing path. Remote URL drops and unsupported internal
payloads are rejected rather than passed to QtNodes default handlers.

Saved assets are fetched through authenticated `assets.get` before node
creation. Image, audio, video, document and model assets become the web's
corresponding constant nodes with canonical `asset://` references. Folder assets
use `nodetool.input.AssetFolderInput` and the web's normalized folder name.
String and dataframe assets load their full content rather than metadata
previews. Full resource IDs are retained. An exact short prefix is accepted only
when the authorized server resolves it, and the resulting reference stores the
full ID. Mismatched and ambiguous responses add no node.

External media/document/model and text files use the existing multipart upload
service. A bound server workflow supplies `workflow_id`; local and unbound
workflows do not invent a server relationship. PNG is a regular image upload.
Valid non-workflow JSON becomes a String value. CSV is parsed locally into the
web's string-column dataframe shape without an upload. The CSV reader handles
BOMs, common autodetected delimiters, quoted multiline fields, escaped quotes,
and whitespace after a closing quote. Text/content reads are strict UTF-8 and
limited to 8 MiB. Non-CSV dataframe file types preserve uploaded asset
references. Saved dataframe content follows the web's text/CSV path, so binary
formats requiring a native decoder are not silently interpreted as text.

Drop coordinates are captured through the inverse viewport transform before
asynchronous work. Multiple items use two columns with 250 scene-unit offsets.
Saved-asset drops require the pane; external files can also be dropped over a
card, matching the web handler's separate target rules. Shared
[NodeCreation](../src/graph/NodeCreation.cpp) supplies metadata defaults and
creation sizes. Each successful node uses one undoable add command. No pending
or failed upload creates a graph placeholder.

The shared-primitives upload panel shows progress, errors, Cancel and Retry,
and is reachable again through **More → Canvas uploads**. Cancel, workflow
replacement and account changes invalidate pending completions. Read-only
changes and removed metadata are rechecked before commit. Retrying is explicit.
Uploading an asset and adding a node are separate operations, so cancellation,
failed graph commits and graph undo do not delete an already uploaded library
asset.

[CanvasDropTest](../tests/ui/CanvasDropTest.cpp) drives actual Qt drag-enter,
move and drop events in the host. It covers fractional transformed positions,
upload metadata/authentication, canonical references, type/default mappings,
CSV dialects, invalid JSON, real panel pointer actions, undo, rejected IDs,
read-only completion and delayed upload/asset/content scope changes. Set
`NODETOOL_CANVAS_DROP_CAPTURE_DIR` for dark/light error-state captures.
`NODETOOL_DROP_LIVE_URL` enables the disposable provider-free PNG upload proof,
including saved-workflow association and an unchanged server graph.

This is a partial F02 implementation. A workflow JSON file opens in its own tab
without a server copy, and saved sketch and timeline payloads become constant
nodes. Example installation and graph fragments, storyboard and chat-media
payloads, Electron's in-place `file://` mode, directory imports and operating
system cross-application drag acceptance remain unverified or unsupported. The
[F02 table](#f02-drag-nodes-assets-and-files-onto-the-canvas) lists each case.

## Selected execution evidence

`node_editor_canvas_authoring` clicks the selection toolbar and inspects the
actual MsgPack run request, then checks Stop, reconnect, history and disabled
selection persistence through save/reopen and undo. `node_editor_server_tests`
checks the submitted minimal region, exclusion of downstream/unrelated nodes,
invalid and empty IDs, bypass pruning, live constants, null and typed-list
inlining, explicit generative inclusion and cyclic dependency traversal.

The submitted graph preserves the document in memory. Full resource IDs are
used as selected IDs. Empty or unknown selections never fall back to a whole
workflow run. Legacy bypass means disabled at this submission boundary: it
removes nodes and incident edges without inventing pass-through connections,
matching `web/src/stores/WorkflowRunner.ts`.

Native selected execution ports the content identities and resolution rules
from `web/src/utils/nodeHash.ts`, `runResolve.ts` and `runSubgraph.ts`. The native
planner test includes an independent JavaScript oracle for UTF-16 cyrb53 and
canonical numeric/string/asset serialization. Computed values require a matching
full-graph input signature, a valid metadata TTL, and no upstream that must run.
Completion stamps prefer upstream generations produced by the same job. Editing
a source after dispatch cannot stamp its old result as the new configuration.

Generative values honor an exact saved single pin or the newest completed value.
An ordered multi-selection injects the web-compatible `nodetool.control.ForEach`
replay graph. Missing pins and missing usable outputs block with an instruction
to choose a completed generation or explicitly select the upstream node. Editing
a generator does not silently authorize a new provider run: its saved output can
still be reused, with a status notice that the source was edited.

The execution cache records complete protocol `generation_complete` outputs,
scoped by workflow and server credentials. It never imports rendered or bounded
preview values. Limits evict whole values instead of truncating execution inputs.
Credentials and local file changes clear this cache. Saved workflow opens hydrate
durable node generations through authenticated `assets.list` responses. Full text
and structured JSON bytes are downloaded independently of preview values. Media
generations retain durable asset references. Persisted assets replace their live
job/variant twins without duplicate rows. Stale workflow/account responses are
discarded, and refresh replaces the durable set so deleted pins become missing.

The inspector History tab separates preview from document edits. Pin, Use latest,
and ordered replay changes preserve unknown UI fields and undo in one step.
Opening or refreshing history never makes a document dirty. Missing pins remain
stored with a clear recovery message and block execution rather than choosing a
different generation. The native history list still differs from the web grouped
thumbnail grid and single-view pager.

Group runs expand runnable descendants recursively. Cached/live values sharing a
typed-list input use ValueInput feeder nodes so the kernel retains every
contributor. Scalar mixed inputs and cached/replay contributors sharing an input
are refused. No refusal silently executes an unselected generator.

Set `NODETOOL_PARTIAL_LIVE_URL` to a disposable backend when running
`node_editor_server_tests` or CTest to exercise live deterministic partial runs.
The fixture uses constant and Prompt nodes, checks cached target-only execution,
then edits a constant and checks the exact deterministic dependency rerun and
correct outputs. A deterministic Prompt fixture with generative metadata also
checks ordered replay over the real ForEach protocol. It verifies disabled and
unrelated node omission and unchanged local/server workflow JSON, then deletes
its workflow. It makes no provider-paid requests.

## Lineage link evidence

`node_editor_lineage` checks the web facing-anchor and Bezier formulas, dotted
paths and hit targets, selection/delete signals, scene reset ownership, link
commands, copy/paste, unknown fields and file round trips. A later signal observer
must receive an intact link ID even when an earlier host callback deletes the
emitting graphics item.

`node_editor_lineage_host` opens saved links as editable documents and drives the
selection toolbar, keyboard and middle-click deletion, modifier selection,
mixed node/link deletion, one-step undo, nested-group dragging and scene resets.
Set `NODETOOL_LINEAGE_CAPTURE_DIR` when running `node_editor_lineage_host_tests`
to capture `lineage-dark.png` and `lineage-light.png`. These checks establish
persisted `graph.links` authoring. Links carry no values or execution order.
Live execution and branch overlays remain separate work.

## C1 behavior tables for F01, F02, F03 and F04

Each table lists the web behavior with its source lines, the native state read
from the code before this work, and the state after it. States are Implemented,
Partial and Missing. "Gap" marks a behavior left open, with its reason. Web
paths are relative to `web/src/`. Captures were opened at their original
resolution. The web reference captures in the A1 window-parity set show the
library at rest, so the comparison of the new states rests on reading the web
components.

### F01 catalog search and add

The native catalog is the docked library (`qml/Catalog.qml`), the counterpart of
the web `NodeLibrary`. Space and a pane double-click give it the floating node
menu's pointer placement.

| # | Web behavior | Before | Now |
|---|---|---|---|
| 1 | Space toggles the node menu, and the node lands at the pointer (`hooks/useNodeEditorShortcuts.ts` 160-178, `stores/NodeMenuStore.ts` 512) | Partial. Space focused the search, and adds went to the visible center | Implemented. Space over the canvas arms the pointer point, and the footer reads "adds at the pointer" |
| 2 | A double-click on the empty pane opens the menu at the pointer (`hooks/handlers/usePaneEvents.ts` 47-64) | Missing | Implemented through `EditorScene::paneDoubleClicked`. Cards, groups and wires do not arm it |
| 3 | The toolbar Add node opens the menu with a centered drop point (`hooks/useFloatingToolbarActions.ts` 392-416) | Implemented | Implemented |
| 4 | The sidebar library lists categories with counts and node rows (`components/node_menu/NodeLibrary.tsx` 403-416) | Implemented | Implemented. Counts follow the provider filter |
| 5 | The search takes focus when the menu or library opens (`components/search/SearchInput.tsx` 119-123, `NodeLibrary.tsx` 337-341) | Implemented | Implemented |
| 6 | Up and Down move a highlight that wraps (`NodeMenuStore.ts` 614-627) | Missing | Implemented. The picked row shows the selected row style and scrolls into view |
| 7 | Enter adds only after an arrow picked a row. A new search clears the pick (`components/node_menu/NodeMenu.tsx` 227-232, `NodeMenuStore.ts` 255, 628-633) | Missing | Implemented |
| 8 | Escape closes the menu (`SearchInput.tsx` 137, `NodeMenu.tsx` 234) | Partial. Escape cleared an edit in progress | Implemented. Escape clears the search, ends pointer placement and returns the keyboard to the canvas |
| 9 | Space in an empty search closes the menu (`SearchInput.tsx` 159-166) | Missing | Implemented while pointer placement is armed. The docked library keeps Space as text otherwise |
| 10 | Ctrl+Backspace or Ctrl+Delete clears the search (`SearchInput.tsx` 129-135) | Missing | Implemented |
| 11 | Enter or Space on a focused row adds it (`components/node_menu/NodeLibraryRow.tsx` 167-171) | Implemented | Implemented |
| 12 | Title 6, node type 4, namespace 2 and description 1 score per term, a whole token adds twice the weight, core namespaces score 1.5 times and deprecated nodes 0.15 times (`utils/ranking.ts` 98-134, `utils/nodeRanking.ts` 42-47, 95-104) | Partial. Title and namespace substrings in catalog order | Implemented in `src/graph/CatalogSearch.cpp` |
| 13 | The query, its pieces split on whitespace and commas, and its last dotted segment are terms. The two expansions are not merged, so a piece that both produce counts twice (`ranking.ts` 98-108, `utils/nodeSearch.ts` 328-335) | Missing | Implemented, including the double count. Native had merged the pieces |
| 14 | The loose pass (separator-free matches at 0.6, subsequences at 0.3) is off for nodes. It serves the model menu only (`ranking.ts` 82-95, 196-205, `nodeRanking.ts` `buildConfig` sets no `fuzzyFallback`) | Wrongly implemented for nodes | Removed. The fuzzy boost below replaces it |
| 15 | Recent nodes add 10 / (rank + 1) and quick-action types add 6, with or without a query, then node type breaks ties with the locale collation (`ranking.ts` 225-253, `config/quickActionNodeTypes.ts`, `stores/RecentNodesStore.ts` 23, 51) | Missing. Browse order was catalog order | Implemented. Twelve recent types persist in settings. The quick-action list now includes the three dynamic provider nodes that native had lacked |
| 16 | Prefix-tree boosts (title 8, namespace 4, description 2, times the field weight and 2 for an exact title), BM25 boosts (six fields, k1 1.5, b 0.75, 200 results, scale 1.5) and fuzzy boosts under 100 results (`nodeSearch.ts` 215-374, `PrefixTreeSearch.ts`, `bm25.ts`, `fuzzyMatch.ts`) | Missing | Implemented. `CatalogTest::rankingMatchesTheWebAlgorithmOnRealMetadata` compares the order of 25 queries over 918 real node and code snippet names with the output of `rankSearchNodes` run under Node (`scripts/generate-catalog-search-fixture.mjs`, `tests/ui/CatalogSearchFixture.json`). Removing the prefix, BM25 or fuzzy boosts each fails it |
| 17 | A provider chip in the search row lists All providers, Local and each API provider with counts, and narrows the list and counts (`NodeLibrary.tsx` 363-430, 537-544, `components/node_menu/NodeProviderFilter.tsx`, `utils/nodeProvider.ts` 140-175) | Missing | Implemented. `CatalogCategories.cpp` ports the provider table |
| 18 | Nodes whose provider key is missing stay hidden behind a notice with Show them. Hidden nodes stay out of the list, the counts and the search (`hooks/useNodeProviderFilter.ts`, `components/node_menu/MissingKeyNodesNotice.tsx`, `NodeLibrary.tsx` 336-353, `NodeMenu.tsx` 238-246) | Implemented | Implemented. Sign-in and machine gates (Vertex AI, Codex, Claude Code) depend on the server provider list and are not gated. `ChromeParityTest::catalogHidesNodesThatNeedAMissingKey` covers it |
| 19 | Hovering a row shows its description, with a hint when nothing is hovered (`NodeLibrary.tsx` 443-448, 608-617) | Implemented | Implemented |
| 20 | No match shows an empty state (`NodeLibrary.tsx` 561-568) | Implemented | Implemented |
| 21 | No metadata clears the list (`NodeMenuStore.ts` 368-371) | Implemented as "No nodes loaded" | Implemented |
| 22 | The floating menu's home: Favorites, Recent nodes (without quick actions) and the AI nodes, Provider models and Constants tiles, shown while nothing is typed, picked or filtered. The toolbar holds Local and API chips, five output type chips, input and output type filters and a node count (`components/node_menu/NamespaceList.tsx` 450-500, `TypeFilterChips.tsx`, `FavoritesTiles.tsx`, `RecentNodesTiles.tsx`, `QuickActionTiles.tsx`, `typeFilterUtils.ts` `filterDataByExactType`) | Missing | Partial. Native has no second surface. The library becomes the node menu while Space or a pane double-click arms pointer placement, and shows the chips and the home then. The toolbar Add node and the sidebar open the docked library, which keeps the web library layout. Tiles use the node's output type icon and color, not the web's per-tile icons and gradients. A tile for a node that the catalog lacks stays and cannot add, where the web warns on click. The input and output type menus sit inline, where the web opens them from a Filters button. Favorites persist as twelve types, newest first, and a star on a row toggles one. The clear buttons act at once, where the web confirms. The menu is not draggable or resizable |
| 22a | A filter applies to the search too, and the result is ranked over the filtered set, so BM25 weights follow that set (`utils/nodeSearch.ts` `computeSearchResults`) | Missing | Implemented |
| 23 | An add from the menu clears the cards it would cover vertically (`hooks/useCreateNode.ts` 64-75, 89-110) | Missing. Repeated adds stacked on one spot | Implemented with `compatibleNodeY` and the card's real size |
| 24 | The menu closes after an add, and a pane press closes it (`useCreateNode.ts` 115, `usePaneEvents.ts` 95-98) | Partial | Implemented. A replaced workflow also drops the pointer point |
| 25 | One add creates one undo entry. The web can write two (`useCreateNode.ts` 84-110) | Implemented | Implemented |
| 26 | Read-only documents. The web has no check | Implemented as a refusal | Implemented |

Evidence: [CatalogTest](../tests/ui/CatalogTest.cpp) types into the real search,
presses arrows, Enter, Escape, Space and Ctrl+Backspace, clicks rows, chips,
tiles, stars and the provider chip, double-clicks the pane and a card, and
presses Space over the viewport. It checks the result order against the web
ranking fixture, the pick, pointer placement under zoom, focus return, overlap
clearing, one undo entry per add, read-only refusal and document replacement.
Regenerate the fixture with `node native/node-editor/scripts/generate-catalog-search-fixture.mjs`
after `npm run build:packages`. Its `--check` flag fails when the web output moves.
Set `NODETOOL_CATALOG_CAPTURE_DIR` to write `catalog-search`, `catalog-pointer`,
`catalog-providers` and `catalog-menu` in dark and light.

### F02 drag nodes, assets and files onto the canvas

| # | Web behavior | Before | Now |
|---|---|---|---|
| 1 | A library node drops anywhere on the canvas, over cards too (`hooks/handlers/useDropHandler.ts` 157-172) | Implemented | Implemented |
| 2 | The drop point maps through the viewport transform (`useDropHandler.ts` 150-153) | Implemented | Implemented |
| 3 | Saved assets drop on the pane only. Several form a grid of two per row 250 apart (`useDropHandler.ts` 36-40, 317-389) | Implemented | Implemented |
| 4 | Unsupported asset types warn and add nothing. CSV parses, text downloads, folders get a slug name (`hooks/handlers/addNodeFromAsset.ts` 71-137) | Implemented | Implemented |
| 5 | External files need a signed-in user and are classified as PNG, JSON, CSV, document or other (`useDropHandler.ts` 67-105, 393, 446-447) | Implemented | Implemented |
| 6 | A workflow JSON file opens as its own workflow instead of entering this graph (`hooks/handlers/dropHandlerUtils.ts` 33-41, 204-220) | Missing. The drop failed with "Use Open file instead" | Partial. The file opens in its own tab, or switches to the tab that has it. The web also creates a private server copy. Native leaves that to Server Save |
| 7 | Other JSON uploads as a file. CSV becomes a dataframe locally (`dropHandlerUtils.ts` 232-273) | Implemented | Implemented |
| 8 | Uploads go into the Library's current folder (`dropHandlerUtils.ts` 128-167) | Partial. Uploads go to the library root with the workflow association | Gap. The canvas has no current Library folder in native |
| 9 | Electron keeps a local file in place as a `file://` value (`dropHandlerUtils.ts` 69-122) | Missing | Gap. Native uploads every file. The in-place mode needs a check that the server reads the same disk |
| 10 | A saved sketch or timeline becomes a constant node with `{type, id}` and a fallback title (`useDropHandler.ts` 195-239) | Missing | Implemented. It needs no server and is refused over a card |
| 11 | Chat media becomes a constant node (`useDropHandler.ts` 176-193) | Missing | Gap. No native surface emits the chat-media payload |
| 12 | Example models, documents and workflows install from the server, then add (`useDropHandler.ts` 243-315) | Missing | Gap. Native has no examples panel or example install client |
| 13 | Drag-over shows no canvas indicator (`useDropHandler.ts` 471-479) | Implemented | Implemented |
| 14 | One undo entry per added node (`useDropHandler.ts` 157-172, 317-389) | Implemented | Implemented |
| 15 | Read-only documents and unknown node types. The web has no check (`utils/instantiatePaletteNode.ts` 179, 188) | Implemented as refusals | Implemented |

Evidence: [CanvasDropTest](../tests/ui/CanvasDropTest.cpp)
`csvJsonAndUnsupportedNoGhostNodes` now drops a workflow file and checks the new
tab, its node, the unchanged upload count and the unchanged transfer panel.
`sketchAndTimelineDocumentsBecomeConstantNodes` drops both payloads under zoom
and checks values, titles, positions, card refusal, a missing ID, missing
metadata and undo. [CanvasAuthoringTest](../tests/ui/CanvasAuthoringTest.cpp)
covers library drags.

### F03 wire drag, reconnect and the compatible-node picker

| # | Web behavior | Before | Now |
|---|---|---|---|
| 1 | Type rules: `any`, list element, unions, `object`, enums and nested lists (`utils/TypeHandler.ts` 181-285) | Implemented in `src/document/ConnectionTypes.h` | Implemented |
| 2 | Cycles, duplicates and missing handles are refused (`hooks/handlers/useConnectionEvents.ts` 20-76, `stores/NodeStore.ts` 1600-1680) | Implemented | Implemented |
| 3 | While a wire is dragged, compatible handles grow 1.2 times with a glow, the rest fade to 0.15, shrink and lose color (`components/node/NodeOutput.tsx` 105-122, `components/node/PropertyField.tsx` 148-158, `styles/handle_edge_tooltip.css` 62-78) | Missing | Implemented in `EditorScene::handleConnectable` and the handle painter. The selection fade pauses during the drag, because a handle press selects its card in native |
| 4 | Settled wires dim to 0.15 while connecting (`handle_edge_tooltip.css` 121-126) | Missing | Implemented |
| 5 | The dragged line has a 6 px glow at 0.15, a 2.5 px stroke dashed 8 4 for control wires, and a 6 px dot at the pointer (`components/node_editor/ConnectionLine.tsx` 25-87) | Partial. A 1.5 px stroke in the type color | Implemented |
| 6 | A release on a handle that rejects the wire warns "Cannot connect these handles" (`useConnectionHandlers.ts` 333-352) | Missing. The release did nothing | Implemented through `EditorScene::connectionRefused` and the status message |
| 7 | A release on a card body connects one compatible handle, offers a choice for several, and creates dynamic inputs or outputs, with Reroute, Preview and control cases (`useConnectionHandlers.ts` 377-650) | Implemented | Implemented |
| 8 | A release on the "+ add input" button forces a new dynamic input (`useConnectionHandlers.ts` 433-444) | Missing | Implemented through the card Add input action geometry and existing atomic dynamic-connection command. Reroute, Preview and control priorities remain ahead of this path |
| 9 | A release on the pane, a group or the wire's own handle opens the output or input menu at the pointer (`useConnectionHandlers.ts` 654-705) | Implemented as the compatible-node picker | Implemented |
| 10 | A right-click on a handle opens the same menu (`NodeOutput.tsx` 66-84, `PropertyField.tsx` 165-180) | Missing. The node menu opened | Implemented through `EditorScene::handleContextMenuRequested` |
| 11 | The output menu deletes a dynamic output while the search is empty (`components/context_menus/OutputContextMenu.tsx` 93-124, 622-630) | Missing | Implemented as one undoable command that also removes its wires. The web takes two steps |
| 12 | The output menu's Preview, Output, Reroute, Save, AI transform and quick-action shortcuts (`OutputContextMenu.tsx` 568-632) | Partial. Matching catalog nodes appear in the list | Gap. The pinned shortcuts are not built. Save and AI transform also need their native targets |
| 13 | The input menu's Constant, Input with copied limits, Prompt and AI value shortcuts (`components/context_menus/InputContextMenu.tsx` 435-447, 946-997) | Partial. Matching catalog nodes appear in the list | Gap. The pinned shortcuts and the copied limits are not built |
| 14 | The menu lists compatible nodes, filters by search and shows an empty state (`OutputContextMenu.tsx` 389-408, 654-659) | Implemented | Implemented |
| 15 | A new node connects its first compatible declared input (`OutputContextMenu.tsx` 410-468) | Implemented | Implemented |
| 16 | Output-side nodes go right of the anchor, input-side nodes 40 px left and centered (`InputContextMenu.tsx` 292-316, `hooks/useHandleNodePlacement.ts` 96-162) | Implemented | Implemented |
| 17 | A scalar target replaces its wire, a list target collects (`NodeStore.ts` 420-441) | Implemented | Implemented |
| 18 | The menu search takes focus and Escape closes it (`OutputContextMenu.tsx` 438-447, 471-480) | Implemented, with arrows and Enter | Implemented |
| 19 | Reconnect keeps the edge on its own handle, moves it to a valid handle, and deletes it elsewhere (`hooks/handlers/useEdgeHandlers.ts` 95-114, `NodeStore.ts` 920-988) | Implemented | Implemented |
| 20 | A middle click on a wire deletes it (`useEdgeHandlers.ts` 116-126) | Missing. Middle press always panned | Implemented. A middle drag that starts on a wire still pans |
| 21 | One undo step per connect. A dynamic slot and its wire share one (`NodeStore.ts` 992-994, `useConnectionHandlers.ts` 405-426) | Implemented. Picker node and wire also share one, where the web takes two | Implemented |

Evidence: [BodyDropHostTest](../tests/ui/BodyDropHostTest.cpp)
`dragMarksConnectableHandles` drags from a real output and reads the handle
states mid-drag. `refusedHandleReleaseReportsAndAddsNothing` releases on a float
input. `middleClickDeletesWire` clicks and drags with the middle button.
[CompatiblePickerHostTest](../tests/ui/CompatiblePickerHostTest.cpp)
`rightClickHandleOpensMenuAndDeletesDynamicOutput` right-clicks static and
dynamic outputs, types a search, and clicks Delete output with the pointer.
`NODETOOL_RECONNECT_CAPTURE` writes `connecting-dark.png` and
`connecting-light.png`. `NODETOOL_COMPATIBLE_CAPTURE` writes
`<prefix>-handle-menu-dark.png` and `<prefix>-handle-menu-light.png`.

### F04 dynamic inputs and outputs

| # | Web behavior | Before | Now |
|---|---|---|---|
| 1 | The card body has Add input and Add output buttons when metadata allows them (`components/node/NodePropertyForm.tsx` 92-140, `components/node/NodeContent.tsx` 177-185) | Partial. The inspector I/O tab has both | Implemented for generic cards through focused named dialogs. Existing content/subgraph Add output remains reachable |
| 2 | A content card's footer adds `input_N` without a dialog (`ContentCardBody.tsx` 783-792, 915-929) | Missing | Implemented. The first unused static/dynamic-safe `input_N` starts as an empty string in one undo step |
| 3 | A wire dropped on a card creates a typed dynamic input or output (`useConnectionHandlers.ts` 377-497, 640-649) | Implemented | Implemented |
| 4 | Enter confirms an add (`NodePropertyForm.tsx` 163-168, `components/node/AddDynamicOutputDialog.tsx` 78-94) | Missing. Only the Add button added | Implemented |
| 5 | A new output offers bool, int, float and str and starts as str (`AddDynamicOutputDialog.tsx` 22-37) | Partial. It started as bool | Implemented |
| 6 | Empty names, names starting with a digit and taken names are refused (`utils/identifierValidation.ts` 14-33, `hooks/nodes/useDynamicProperty.ts` 51-73, `AddDynamicOutputDialog.tsx` 51-65) | Implemented, with reserved names and control characters also refused | Implemented |
| 7 | Rename starts from the card label or edit icon (`components/node/PropertyInput.tsx` 496-513, 648-658) | Partial. The inspector has rename fields | Implemented through card-label double-click and an edit control |
| 8 | Enter or leaving the field commits a rename (`PropertyInput.tsx` 478-486) | Partial. Only the Rename button committed | Card rename commits on Enter or blur and cancels on Escape. The inspector keeps its explicit Rename/Cancel behavior and retains a draft on focus loss |
| 9 | Rename moves the value, the declaration and the wires (`useDynamicProperty.ts` 134-161, `NodeStore.ts` 1293-1306) | Implemented | Implemented |
| 10 | An unconnected input of a user-owned node shows a type chip with the slot palette, narrowed by `allowed_dynamic_slot_types` (`components/node/DynamicSlotTypePicker.tsx` 47-114, `utils/dynamicSlotTypes.ts` 39-111, `PropertyInput.tsx` 530-535) | Missing | Implemented on the card label row and in the inspector row through the `setDynamicInputType` command. The card chip shows the slot type in its type color and opens a checked menu of the palette. Schema-driven nodes, connected inputs and read-only cards show none |
| 11 | A retype keeps a value that fits the new type and reseeds one that does not (`useDynamicProperty.ts` 175-197, `utils/dynamicSlots.ts` 126-147) | Missing | Implemented, one undo entry |
| 12 | The X removes the value, the declaration and the wires in one step (`useDynamicProperty.ts` 75-98) | Implemented in the inspector | Implemented on the card label row and in the inspector |
| 13 | The output-handle menu deletes a dynamic output (`OutputContextMenu.tsx` 93-124) | Missing | Implemented. See F03 row 11 |
| 14 | Output rename has a hook and no UI in the web (`hooks/nodes/useDynamicOutput.ts` 38-46) | Implemented in the inspector | Implemented |
| 15 | Legacy string declarations read as their type (`utils/dynamicSlots.ts` 85-107) | Partial. They read as `any` | Implemented in the inspector rows |

Evidence: [DynamicPortsTest](../tests/dynamic-ui/DynamicPortsTest.cpp)
`keyboardAddRenameAndRetype` types names and presses Enter, picks types with
keys in the real select, presses Escape in a rename draft, moves focus away
from another and checks that its draft stays, adds a wire and checks the
refused retype, and reads undo and redo. [AuthoringUiTest](../tests/ui/AuthoringUiTest.cpp) and
[the graph projection suite](../tests/ui/DynamicPortsTest.cpp) cover the
existing flows. DynamicCardTest `cardTypeChipRetypesInOneStep` clicks the card
chip, checks the current type in the menu, clicks another type and reads the
reseeded value, the single undo entry and the restored snapshot.
`cardTypeChipHiddenForConnectedAndSchemaDrivenSlots` checks the connected,
schema-driven and read-only cases, and `cardRemoveControlDeletesSlotAndWires`
removes a connected slot from the card. The card's rename control used an
`edit` icon that the canvas icon table lacked, so it painted nothing. The table
now has the web's EditOutlined and CloseOutlined paths. The web reveals the
chip, rename and remove controls on hover. The native card paints them at all
times. Visual acceptance against the web remains open.

[DynamicCardTest](../tests/ui/DynamicCardTest.cpp) drives card additions,
controlled output-type selection, connected rename with preserved edge metadata,
validation and cancellation, forced fresh-input wire drops, read-only/collapsed
controls and round trips. It also exercises large dynamic-label projections and
popup teardown across owner/tab windows. A reproduced teardown crash was fixed
by retiring popups before Quick panels and scene destruction, guarding child
pointers and keeping controllers alive through root teardown. The complete
focused suite passes. `NODETOOL_DYNAMIC_CARD_CAPTURE` writes editor and separate
popup captures, including validation errors, in both themes and two sizes.
Offscreen proof does not establish native compositor, IME or full F04 acceptance.

## C5 behavior tables for F11, F12, F16 and F17

Each table lists the web behavior with its source lines, the native state read
from the code before this work, and the state after it. States are Implemented,
Partial and Missing. The captures in "Evidence" were opened at their original
resolution and compared with the web components by reading their source. No web
build was run beside them, so no pixel comparison with the web exists.

### F11 graph links and execution relationships

| # | Web behavior | Before | Now |
|---|---|---|---|
| 1 | Lineage links draw dotted from the facing sides with a label and a 16 px hit target (`LinkLayer.tsx` 53-83, 157-210) | Implemented | Implemented |
| 2 | Click, modifier click, Enter, Space, Delete, Backspace, middle click and the edge menu act on a link (`LinkLayer.tsx` 100-150) | Implemented | Implemented |
| 3 | An edge flows while its source node is starting, running or booting, or the edge reports `message_sent` (`useProcessedEdges.ts` 418-451, `CustomEdge.tsx` 62, `handle_edge_tooltip.css` 148-155) | Partial. The flow followed the target node and the edge statuses `running` and `active` | Implemented in `WorkflowGraphModel::runtimeWireFlowing`. Control edges never flow |
| 4 | An edge that carried more than one item shows its count in a pill (`CustomEdge.tsx` 60, 120-135) | Missing | Implemented in `WirePainter`, with the card background, 600 weight and pill radius |
| 5 | A streaming source draws its flow wider (`useProcessedEdges.ts` 305-309, `handle_edge_tooltip.css` 158-162) | Missing | Implemented. The flow is 4 wide when the source declares `is_streaming_output` |
| 6 | After a run, the untaken side of an If or Switch fades to 0.4, a node with one live input stays, and a selection's 0.2 wins (`untakenBranches.ts`, `ReactFlowWrapper.tsx` 862-947, `nodes.states.css` 75-78) | Missing | Implemented by `src/run/UntakenBranch.h` and `EditorScene::updateBranchDimming`. Edge reports now outlive the finished run, as the web store does |
| 7 | A selection keeps its branch at full opacity and fades the rest to 0.2 (`reactFlowGraphModel.ts` 178-263) | Implemented | Implemented |
| 8 | An Agent control edge leaves the bottom center of the controller, enters the top center of the controlled node and draws amber, dashed 8 4, 2 wide at 0.7 opacity and 3 wide at full opacity when selected (`ControlEdge.tsx` 12-40, `BaseNode.tsx` 756, 840) | Partial. The edge became a typed wire between side handles and the card showed a "control" row | Implemented. The handle sits at the card's top or bottom center, takes no row, and the wire paints as `ControlEdge` does |
| 9 | Control edges select, delete and open the edge menu like other edges (`EdgeContextMenu.tsx` 43, 154) | Implemented through the shared wire | Implemented |
| 10 | An edge from or to a bypassed node draws dashed at half opacity (`useProcessedEdges.ts` 298-302) | Implemented | Implemented |

Evidence: `RuntimeUiTest` covers flow, count pill and the not-run fade with
scene pixels. `NodeRuntimeModelTests` covers the web rules for the untaken
branch and edge reports after the job ends. `LineageHostTest` drives a real
click, Delete key, middle click and edge menu request on a control edge, reads
its endpoints and counts amber pixels. `LineageHostTest::executionStateCapture`
writes `execution-dark.png` and `execution-light.png` to
`NODETOOL_LINEAGE_CAPTURE_DIR`.

Gaps. The web shows the top control handle only while an edge uses it or one is
being dragged. Native draws it only while an edge uses it, and the bottom handle
of an Agent shows only with an edge too. A reverse control wire caps its tangent
so it stays inside the QtNodes bounds, so it bends less than the web curve. The
kernel emits the statuses `active` and `completed` and never `message_sent`, so
the web flow comes from the running source node in practice.

### F12 auto layout and selection alignment

| # | Web behavior | Before | Now |
|---|---|---|---|
| 1 | One Auto layout lays out the selection when two or more nodes are selected, and the whole graph otherwise (`NodeStore.ts` 1466-1472) | Partial. More has Auto layout for the whole graph and Layout selection for a selection | Partial by design. The two actions cover both cases with the same engine |
| 2 | Comment nodes stay where they are (`graph.ts` 163-165) | Implemented | Implemented |
| 3 | Layered left to right with 30 between layers, 50 between nodes and 50 padding (`graph.ts` 143-153) | Implemented | Implemented |
| 4 | A control edge pins controller and controlled node to one layer (`graph.ts` 102-140) | Implemented | Implemented |
| 5 | The controlled node sits directly after its controller (`graph.ts` 247-281) | Missing | Implemented in `AutoLayout.cpp` |
| 6 | Siblings of one source keep that source's output order (`graph.ts` 283-345) | Missing | Implemented through `LayoutOptions::outputOrder`, filled from the card's output ports |
| 7 | The top left of the top-level nodes stays where it was (`NodeStore.ts` 1514-1531) | Missing. The graph moved to 50, 50 | Implemented |
| 8 | A group resizes to its children's extent plus 50 (`graph.ts` 423-445) | Missing | Implemented. `LayoutResult::groupSizes` joins the move in one batch |
| 9 | One undo step, then the view fits (`NodeStore.ts` 1557-1558) | Implemented | Implemented, including the group sizes |
| 10 | Title panels reserve height (`graph.ts` 198-206) | Implemented through card bounds | Implemented |
| 11 | Align and Align with spacing sort by the longer axis, use 40 and 20 gaps and leave group children with their group (`useAlignNodes.ts` 26-150) | Implemented | Implemented |
| 12 | Distribute, stack and grid actions (`SelectionActionToolbar.tsx`, `useSelectionActions.ts`) | Implemented | Implemented |
| 13 | ELK network simplex placement and crossing minimization (`graph.ts` 144-153) | Partial. Native uses SCC layering with barycenter order | Partial. This is a deliberate difference |

Timing. `AutoLayoutTest::largeGraphsStayLinear` measures 500, 2,000 and 20,000
nodes with about two edges each. On this machine they took 7, 33 and 356 ms,
so 10 times the nodes took 10.8 times as long.

Evidence: `AutoLayoutTest` covers anchoring, group sizes, output order and
control placement. `CanvasAuthoringTest::autoLayoutKeepsTheAnchorFitsGroupsAndUndoesOnce`
drives the real menu action, checks one undo step and writes
`layout-group-dark.png` and `layout-group-light.png` to
`NODETOOL_CANVAS_CAPTURE_DIR`.

### F16 reset, remove, dynamic fields and conditional visibility

| # | Web behavior | Before | Now |
|---|---|---|---|
| 1 | A property resets only when its default is not null (`PropertyInput.tsx` 327) | Partial. "Use default" showed for any stored value, including with a null default | Implemented as `hasResetDefault` |
| 2 | A property counts as changed when its value differs from the default by deep equality, and reset acts only then (`PropertyInput.tsx` 328, 556-610) | Missing | Implemented as `changed`. The web shows a disabled reset icon for an unchanged value and native shows no action, as W19 records |
| 3 | A changed value is marked (`PropertyInput.tsx` 617, 603) | Missing | Implemented as a dot beside the label |
| 4 | Reset writes the default back in one undo step (`PropertyInput.tsx` 356-405) | Implemented by removing the stored key | Implemented the same way. The document has no key where the web stores the default |
| 5 | Ctrl or Cmd with a right click resets a changed property (`PropertyInput.tsx` 409-421) | Missing | Implemented. A plain right click does nothing and an unchanged value ignores it |
| 6 | A stored null differs from a non-null default and stays resettable (`PropertyInput.tsx` 328) | Partial | Implemented |
| 7 | Reset reads the default from the dynamic slot, then the node metadata (`PropertyInput.tsx` 366-381) | Implemented through the slot declaration | Implemented |
| 8 | Deleting a dynamic property removes its value, declaration and incoming edges in one undo step (`useDynamicProperty.ts` 75-107) | Implemented. `WorkflowDocumentTest` lines 328 and 366 | Implemented |
| 9 | `visible_when` hides a field without deleting its value, and a connected field stays (`PropertyInput.tsx`, `NodeInputs.tsx`) | Implemented | Implemented |
| 10 | A connected field is inert and shows its upstream state (`PropertyInput.tsx` 622-635) | Implemented | Implemented |
| 11 | Reset applies to every node of a multi-node inspector selection as one undo step (`PropertyInput.tsx` 356-360) | Missing | Missing. The native inspector edits one node |

Evidence: `PropertyFieldsTest::changedAndResettableState` checks the new
descriptor fields. `PropertyBehaviorTest` clicks Reset to default, checks the
marker and the one undo step, and sends Ctrl and plain right clicks. The
captures are described below.

### F17 structured value editors

| # | Web behavior | Before | Now |
|---|---|---|---|
| 1 | JSON keeps its `{type, data}` wrapper (`JSONProperty.tsx` 134-157) | Implemented with unknown wrapper fields kept | Implemented |
| 2 | Blank text clears the value without an error (`JSONProperty.tsx` 134-141) | Implemented | Implemented |
| 3 | Text that is not JSON shows an error. The web still writes it (`JSONProperty.tsx` 143-157) | Implemented as an error that writes nothing | Implemented as required. An invalid draft never reaches the document |
| 4 | The editor follows undo and agent writes while unfocused (`JSONProperty.tsx` 104-110) | Implemented | Implemented |
| 5 | Open in a larger editor and copy buttons (`JSONProperty.tsx` 203-215) | Missing | Missing |
| 6 | Dict rows add, remove and rename. A rename onto an existing key is refused (`DictTable.tsx` 84-100) | Implemented | Implemented |
| 7 | A value type select of int, string, datetime and float (`DictProperty.tsx` 12-60, `ListProperty.tsx` 11-36) | Partial. The declared entry type decides the editor | Partial |
| 8 | List rows add, remove and reorder (`ListProperty.tsx`, `ListTable.tsx`) | Implemented | Implemented |
| 9 | Nested lists and dictionaries as values | Missing. They showed as read-only text | Implemented. Each is a JSON editor that checks the declared container and leaves the document alone on invalid text |
| 10 | A new record column takes the first free "Column N" name (`RecordTypeProperty.tsx` 70-89) | Implemented | Implemented |
| 11 | A record column renames, retypes and describes. A duplicate name is refused (`ColumnsManager.tsx`) | Implemented | Implemented |
| 12 | Rows and unknown fields of a record survive a column edit (`RecordTypeProperty.tsx` 62-69) | Implemented | Implemented |
| 13 | Each committed edit is one undo step, and the document schema rejects wrong shapes | Implemented at the API level only | Implemented and driven by real clicks and keys |
| 14 | String list and dataframe editors (`StringListProperty.tsx`, `DataframeProperty.tsx`) | Missing | Missing. Outside this slice |

Evidence: `PropertyBehaviorTest` clicks Add, Remove and reorder buttons,
types into the nested, JSON, key and record editors with real key events, and
checks undo counts and preserved fields.

## Property picker evidence

[AssetPickerTest](../tests/models/AssetPickerTest.cpp) exercises authenticated
library search and pagination, streaming multipart upload, list/upload failures,
file-type refusal, QML dispatch, connected/read-only controls, and stale
node/server completion suppression. It checks canonical full-ID media references,
one-step undo, and save/reopen. Previews use the existing MediaResolver lease
boundary. Recording, crop/trim, internal library drag payloads, connected upstream-list
previews, and legacy nested-list flattening remain unimplemented.

[ModelPickerTest](../tests/models/ModelPickerTest.cpp) exercises authenticated
catalog queries, typed selection per model family, provider and task filters,
missing-key warnings, legacy string preservation, cancellation, read-only controls, undo, and reopen.
Download-required models remain disabled until native installation controls
exist. 3D, llama.cpp, and Transformers.js fields remain preserved without a selector.

Build the host and run `ctest --test-dir <build> -R
'node_editor_(models|asset_picker)' --output-on-failure`, or configure
`native/node-editor/tests/models` independently with the same Qt prefix.
These deterministic HTTP fixtures do not establish live-provider availability or
platform file-dialog and desktop-drop acceptance.

## Durable generation evidence

`node_editor_generation_history` covers authenticated scope, stale responses,
full text/JSON hydration, persisted/live reconciliation, deletion and media
output arrays. `node_editor_generation_history_ui` uses real pointer controls
for preview, pin/latest, ordered replay, undo, file reopen and missing/deleted
pins. A distinct two-image case verifies independent preview request keys and
cache leases. It failed with both previews showing the same image before the
request keys included their media index.

`node_editor_generation_history_live` uses a disposable backend to generate a
real deterministic Prompt output, persist those exact bytes as a workflow/node
asset, pin and save the workflow, reopen a fresh session, hydrate the saved
value, and execute only its downstream target. It verifies correct output,
unchanged local/server workflow JSON and refusal after the pinned asset is
deleted. Deterministic Prompt metadata marks the saved source as generative only
in the native fixture, so no provider-paid calls are made. Set
`NODETOOL_PARTIAL_LIVE_URL` to run this acceptance case. The History UI fixture
writes `history-dark.png` and `history-light.png` when
`NODETOOL_HISTORY_CAPTURE_DIR` is set.

[ResourcePickerTest](../tests/models/ResourcePickerTest.cpp) checks authenticated
workflow pagination, selected/deleted verification, single/list wrappers, ordered
add/remove/reorder, collection names, empty/error responses, cancellation, undo,
and reopen. [AssetPickerTest](../tests/models/AssetPickerTest.cpp) also checks
workflow PropertyField dispatch, connected/read-only controls, and suppression of
a queued commit after a server change. Workflow search covers loaded pages.
Collection names remain names rather than resource IDs. Native tool lists,
folder/document/entity selectors, and document-specific create/open flows remain
unimplemented. The web workflow and collection properties offer selection only,
so these native fields do not create or open targets.

Run the resource checks with `ctest --test-dir <build> -R
node_editor_resource_picker --output-on-failure`.

## Inline property evidence

[InlinePropertyTest](../tests/graph/InlinePropertyTest.cpp) clicks a painted field
through Graphics View and types into its Quick overlay. It checks commit/undo,
Escape, canvas-blur commit before selection changes, numeric bounds, boolean
and enum selection, multiline draft expansion, connected/handle-only inputs,
scope rejection, viewport alignment, and idle
geometry updates. Typing blocks graph shortcuts while unrelated shortcuts remain
available. [InlineHostTest](../tests/ui/InlineHostTest.cpp) exercises actual
EditorWindow card clicks, typing, one-step undo, and credential-change rejection.

The card also edits the structured, workflow and collection fields that the
web edits inline. The web's rules decide which fields qualify. ListProperty and
DictProperty edit a table only on `nodetool.constant.List` and
`nodetool.constant.Dict`, StringListProperty edits any list of strings, and
JSONProperty and RecordTypeProperty edit on every card. Other lists and
dictionaries show their label alone on both editors. The card paints a summary
field. A click opens a panel that hosts the inspector's structured row editor.
Each change applies as one undo step and the panel stays open across the
re-projection, as the web's tables apply each cell edit. A canvas click commits a
typed entry and closes the panel. Escape closes it. Workflow, workflow list and
collection fields open a select that loads the first 200 workflows or the
collections from the server. A workflow list choice toggles one workflow and
keeps the select on the card. `structuredFieldsFollowWebCardRules`,
`structuredPanelStaysOpenAcrossEdits`, `recordColumnsAndJsonOnCard` and
`workflowAndCollectionSelectsOnCard` drive these with pointer and key events
against a local tRPC stub. InlineHostTest
`structuredPanelStaysOpenThroughHostProjection` repeats the panel through
EditorWindow. The panel's entry rows and JSON text area differ in layout from
the web's ListTable, chip input and Monaco editor. The web's data type select above
a constant List or Dict table has no native equivalent.

Run `ctest --test-dir <build> -R 'node_editor_inline_(property|host)'
--output-on-failure`. `NODETOOL_INLINE_CAPTURE=/path/prefix` writes native
fixture screenshots in both themes. Those captures verify the overlay fixture,
not the complete EditorWindow layout. Platform IME, accessibility, fractional-DPI
rendering, and measured large-graph editing latency remain acceptance work.


## Media playback evidence

[MediaUiTest](../tests/ui/MediaUiTest.cpp) exercises real decoded audio/video,
keyboard speed selection, paused seeking, fullscreen Escape and transport,
source/history cleanup, bounded waveform peaks, zoom/fit, minimap navigation,
looping and end-of-audio reset. Zoom and minimap share the decoded envelope
without restarting its decoder. The Save dialog test types a filename, clicks
Save, checks the exact WAV bytes and verifies cancellation on source reset.
[MediaResolverTests](../tests/media/MediaResolverTests.cpp) checks cache leases,
authentication, redirect credential handling, stale responses and cached-byte
export without another network request. Download names retain format extensions.

[CanvasMediaTest](../tests/graph/CanvasMediaTest.cpp) drives card controls through
viewport widgets and checks decoded video frames, audio playback, graph input
isolation, zoom/pan alignment, viewport clipping, overlapping-card masks, inline
editor stacking and player cleanup. The widgets remain stable while logs arrive.
They use no Graphics View proxy widgets. Reduced motion stops optional graph
animation while explicit media playback remains available.

[CanvasMediaHostTest](../tests/ui/CanvasMediaHostTest.cpp) injects output through
EditorWindow's run-output model and uses the actual in-card controls. It verifies
primary-output selection, preserved workflow/undo state, history changes,
account changes and local workflow replacement. Late events from a previous
scope cannot recreate playback. These tests use deterministic media and require
no provider requests.

Run the native playback checks with:

```bash
ctest --test-dir <build> -R 'node_editor_(media_ui|media_tests|canvas_media|canvas_media_host)$' --output-on-failure
```

Set `NODETOOL_MEDIA_CAPTURE_DIR` to write optional dark/light captures. The host
test writes `node-editor-canvas-media-host-dark.png` and
`node-editor-canvas-media-host-light.png`. The canvas fixture also captures a
graph with multiple nodes and wires. Offscreen interaction and captures do not
establish platform accessibility, fractional-DPI rendering or native file-dialog
acceptance. The Save test uses Qt's fallback dialog. Gallery layout and quick-action
differences are recorded below.

[PropertyPickerHostTest](../tests/models/PropertyPickerHostTest.cpp) captures a
populated image list and generic asset in the actual inspector in dark/light
and wide/narrow layouts. Set `NODETOOL_PROPERTY_CAPTURE_DIR` and run
`node_editor_property_picker_host_tests` from the native host build to write the
captures. [AssetPickerTest](../tests/models/AssetPickerTest.cpp) checks ordered
batch upload, metadata-preserving list operations, partial-batch failure without
reference changes, generic MIME selection/upload, and stale completion rejection
after a same-ID workflow replacement. Metadata-declared `append_static_inputs`
remain editable while connected. Other connected inputs remain locked.

## Compatible-node picker evidence

[CompatibleNodePickerTest](../tests/graph/CompatibleNodePickerTest.cpp) checks
native type rules, typed/declared input preference, primary outputs, explicit
ambiguous ports, metadata defaults, canonical batches, undo, keyboard search,
cancellation, and old-popup generation tokens. The placement test checks
nearest-free boundaries, below-on-tie behavior, backdrop containment, and a large
obstacle set. Interval merging avoids testing every candidate against every node.

[CompatiblePickerHostTest](../tests/ui/CompatiblePickerHostTest.cpp) drags from
selected input/output ports through the actual EditorWindow, verifies unchanged
source geometry, and checks directional placement under zoom, defaults and undo.
It covers own-handle clicks, group backdrops without reparenting, account/document
invalidation, read-only refusal, and real top-level-window pointer delivery.
Padding/wheel input stays in the popup. A lower-row click overlaps the Run toolbar
and verifies that the picker remains above floating chrome.

Run `ctest --test-dir <build> -R 'node_editor_compatible_picker(_host)?$'
--output-on-failure`. `NODETOOL_COMPATIBLE_CAPTURE=/path/prefix` writes actual
EditorWindow popup captures in both themes using a deterministic catalog and
workflow fixture. These tests do not establish complete web menu or visual parity.

Remaining connection flows include full Agent-control
presentation, and the input/output menus' value, code, preview and other
convenience actions. [NodeCreation](../src/graph/NodeCreation.h) centralizes
metadata defaults and overrides, unique input names, rich-preview and specialized
creation sizes, optional pinned model defaults, and palette Concat starter inputs.
The output-side picker assigns a receiving `data.name` from the source handle
when that property exists and honors its metadata style override. Input-side
picker creation leaves the generated name intact. The web sources for these rules
are `NodeStore.createNode`, `instantiatePaletteNode`, `OutputContextMenu`, and
`InputContextMenu`. Parent assignment stays at the root, matching
`NodeStore.createNode` and `addNode`.
[NodeCreationTest](../tests/graph/NodeCreationTest.cpp) covers canonical defaults,
geometry precedence, task-compatible model pins, name collisions, overrides and
one-undo creation. Run `ctest --test-dir <build> -R 'node_editor_creation$'
--output-on-failure`. Code snippets appear in the node menu when the catalog has
the Code node. Choosing one creates a Code node with the snippet code, title and
dynamic slots, as `instantiatePaletteNode` does. The snippets come from
`resources/code/snippets.json`. Regenerate it with
`node native/node-editor/scripts/generate-code-snippets.mjs`. Its `--check` flag
fails when the web snippets move. `CatalogTest::codeSnippetsAddCodeNodes` covers
the menu entry and the created node. Custom user-script materialization, the
virtual AI code entry, and persisted native model preferences remain separate flows.

[PresentationPropertyTest](../tests/models/PresentationPropertyTest.cpp) compares
native color and image-size presets with the checked-out web tables. It checks
bare/wrapped/no-color values, alpha ordering, invalid/canceled drafts, custom
sizes, ratio lock/swap, missing/default values, connected descriptors, undo, and
reopen. [PropertyPickerHostTest](../tests/models/PropertyPickerHostTest.cpp) also
exercises keyboard commits, invalid-input rejection, stale workflow drafts,
connected/read-only controls, and dark/light wide/narrow captures for both fields.
Run `ctest --test-dir <build> -R node_editor_presentation_properties
--output-on-failure`. Font, media-parameter, and local/server path editors remain
missing. Web color history/saved swatches, harmony/contrast tools, eyedropper,
and gradient tooling remain unmatched.

Inspector delegates remain stable across ordinary value updates so ratio lock
survives a dimension commit. Node/property/storage/type, workflow, credential,
and writable-state changes cancel drafts and queued property/reset/remove
commands. The host property test covers same-count field reorder/substitution,
lock persistence, typed-draft isolation, and queued scalar/color/size edits
across credential changes.

## Existing-card body-drop evidence

[BodyConnectionTest](../tests/graph/BodyConnectionTest.cpp) checks both directions,
all compatible port choices, scalar replacement, typed-list fan-in, legacy type
inference, exposed-input persistence, dynamic input/output creation, schema-only
provider refusal, cycle rollback, and Preview/Reroute/declared Agent-control
special cases. Shared type normalization accepts legacy input strings and nested
declarations without rewriting their stored JSON. Malformed dynamic output
imports remain read-only. Dynamic outputs deliberately use the web's top-level
type shape with empty type arguments, as in `useConnectionHandlers`.

[BodyDropHostTest](../tests/ui/BodyDropHostTest.cpp) drives actual selected-port
mouse drags onto existing card bodies and named handles. It verifies explicit
port choice, one-step undo, occupied scalar replacement, collect fan-in, dynamic
slots, incompatible-handle refusal and cycle rollback. Reconnecting either endpoint
preserves the edge ID and unknown metadata. Scalar replacement and typed-list
fan-in are one undoable command. Returning to the same handle adds no undo entry.
Like the web edge-update handler, dropping a reconnect onto the pane or an invalid
handle deletes the edge, with undo. Escape preserves it. Invalid-handle drops are
checked at 50%, 100%, and 150% zoom. Mid-drag account changes and replacement workflows
with identical IDs reject the old move/release and keep the canonical edge visible.
Run `ctest --test-dir <build> -R 'node_editor_body_(connection|drop_host)$'
--output-on-failure`.

Body matching enumerates metadata and declared instance ports, including hidden
conditional properties that become exposed when connected, as the web helper does.
Code ports inferred from source participate in matching. There is no dedicated
canvas add-variable button to force a fresh dynamic input when compatible inputs
already exist. These limits and complete Agent-control presentation remain
separate from the tested body-drop flows.

`NODETOOL_RECONNECT_CAPTURE=/path/directory` writes the native host after a
successful target reconnect. This fixture verifies rendering and interaction,
not a matched web screenshot comparison.


## Output gallery evidence

[RunOutputModelTests](../tests/run/RunOutputModelTests.cpp) checks repeated media
occurrences, ordered mixed text, nested values, streamed append/replace, stable
collection rows and explicit display limits. Large preview normalization leaves
its input unchanged. It does not modify the complete execution/generation cache.
A concrete QJsonValue snapshot protects streamed text from JSON object edits
while an event is normalized.

[MediaGalleryModelTests](../tests/media/MediaGalleryModelTests.cpp) checks that the
virtual model retains the complete supplied list, including items far beyond the
visible viewport. Appends insert model rows without resetting existing ones.
A selected item moving after insertion notifies its index without signaling a
source change. The regression test failed before those notifications were
separated.

`MediaGallery.qml` follows the checked-out image grid measurements. Card tiles
have a 96px minimum with 4px gap/padding from `ContentCardBody`; panel tiles use
`PreviewImageGrid`'s 128px minimum with 8px gap/padding. Tiles remain square and
scroll through a Qt GridView. Only visible image consumers resolve media.
Single clicks focus a tile. Double-click, Enter or Space open its selected view.
Selected images fill the available preview area with preserved aspect ratio.

[MediaGalleryHostTest](../tests/ui/MediaGalleryHostTest.cpp) drives actual
EditorWindow pointer and keyboard controls. It checks repeated images, mixed
text, audio/video selection, explicit playback, stable card/panel players during
logs and appended occurrences, unchanged workflow/undo state, history/account
cleanup and rejection of old-scope events. Native wheel and scrollbar input reach
the final retained tile without page controls. Resizing exercises responsive
columns, viewport consumer bounds and full-area selected-image painting.

[MediaResolverTests](../tests/media/MediaResolverTests.cpp) reproduces the former
refusal when a visible grid requested more than four uncached images. Pending
requests now queue behind four active HTTP requests. The bounded queue supports
cancellation, cache reuse and account changes. Tests cover queue capacity,
credential headers and reuse of a canceled key in a new scope. Server changes
still clear the private cache before consumers can resolve again.

Set `NODETOOL_MEDIA_CAPTURE_DIR` for optional captures in both themes:

- `node-editor-gallery-host-{dark,light}.png` shows mixed card/panel grids.
- `node-editor-gallery-single-{dark,light}.png` shows a selected image.
- `node-editor-gallery-responsive-{wide,narrow}-{dark,light}.png` shows resized
  responsive grids.
- `node-editor-gallery-responsive-selected-{wide,narrow}-{dark,light}.png`
  shows aspect-fit selected images in resized cards.

Run `ctest --test-dir <build> -R
'node_editor_(run_tests|media_tests|media_gallery_model|media_gallery_host)$'
--output-on-failure`.

This remains a gallery subset. Image activation now opens a transient native
modal viewer while retaining independent inline selection. Image-only navigation
preserves occurrence order and repeats. Fit, zoom, pan, dimensions, original-byte
save, cancellation and Escape use the existing resolver. Single-image canvas
cards retain raster painting and create the viewer on demand. Their node menu
adds Open image viewer, reachable with keyboard activation from the selection
toolbar. Native tests cover document and undo preservation, top-card ownership,
bypassed images, scope cleanup and shortcuts in another window. See the
[image viewer design](image-viewer-parity.md). Focused keyboard activation and the complete combined native suite pass.
The focused sanitizer suites also pass serially with leak detection disabled.

The native panel preserves mixed text alongside media, including arrays that the web
image-specific AssetGrid filters to images. Audio/video/text collections use
native gallery tiles rather than every specialized web array renderer.
Grid multi-select with compare, batch download and tile hover actions remain
pending. Selected media reuse the authenticated resolver and download controls.
Offscreen tests do not establish platform accessibility or fractional-DPI
rendering acceptance.

## Output actions evidence

Web owners: `ContentCardBody.tsx` (`VideoPreview`), `ImageView.tsx`,
`AssetViewer.tsx`, `OutputQuickActionButtons.tsx` and
`config/outputQuickActions.ts`. Status is acceptance pending.

| Web action | Native |
| --- | --- |
| Video card Save to assets (`createAsset`, then `POST /api/assets` multipart `json` with `name` and `content_type`) | `MediaResolver::saveToAssets` uploads the leased bytes with the account token and no `parent_id`. The video preview shows Save to assets and the web's result strings. Images and audio do not offer it, as on the web card. |
| Image Copy (`CopyAssetButton`, viewer Copy) | Copy on image previews, the gallery toolbar and the viewer. The decoded pixels go to the clipboard. Video and audio info copy is open. |
| Viewer Download | Unchanged. The save dialog now keeps the media's extension when a bare name is typed. |
| Viewer Compare with another image | Compare, pick another image with Previous and Next, then the shared wipe comparison. Exit returns to picking and Cancel leaves compare mode. Hidden for a single image. |
| Output quick actions Upscale, Remove background, Edit with prompt | Node menu items for a node with an image result. Each requires its node type in the catalog and adds the node plus the `image` wire as one undo step to the right of the output. |
| Library viewer edit, transform, open workflow, info | Open. They act on library assets, not on run outputs. |

`MediaResolverTests` covers the upload request, refusal, missing id, cancel and
lease checks. `MediaUiTest` covers Save to assets, Copy, the dialog suffix and
compare. `MediaGalleryHostTest::imageQuickActionsCreateConnectedNodes` drives the
node menu and checks the new node, wire, placement and undo. Image comparison
layers decode asynchronously and `ImageComparisonTest` waits for both images
before sampling pixels.

Run with:

```bash
ctest --test-dir <build> -R 'node_editor_(media_tests|media_ui|media_gallery_host|image_comparison|rich_output_host)$' --output-on-failure
```

## F14 action inventory

Source identifiers below come from the web owners. Open rows describe the exact missing menu or binding, not the absence of every related document capability. Native bindings and help are defined together in `src/ui/EditorMenus.cpp`. Context and command actions check document and credential epochs before dispatch.

| Web owner | Shortcut or action | Native mapping or remaining difference |
| --- | --- | --- |
| shortcuts.ts `exitFullscreen` | Exit fullscreen: `["Escape"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `copy` | Copy: `["Control", "C"]` | Mapped through this work: Copy. |
| shortcuts.ts `cut` | Cut: `["Control", "X"]` | Mapped through this work: Cut. |
| shortcuts.ts `paste` | Paste: `["Control", "V"]` | Mapped through this work: Paste. |
| shortcuts.ts `undo` | Undo: `["Control", "Z"]` | Mapped through this work: Undo. |
| shortcuts.ts `redo` | Redo: `["Control", "Shift", "Z"]` | Mapped through this work: Redo. |
| shortcuts.ts `selectAll` | Select all: `["Control", "A"]` | Mapped through this work: Select all. |
| shortcuts.ts `align` | Align: `["A"]` | Mapped through this work: Align. |
| shortcuts.ts `alignWithSpacing` | Align with spacing: `["Shift", "A"]` | Mapped through this work: Align with spacing. |
| shortcuts.ts `duplicate` | Duplicate: `["Control", "D"]` | Mapped through this work: Duplicate. |
| shortcuts.ts `duplicateVertical` | Duplicate vertical: `["Control", "Shift", "D"]` | Mapped through this work: Duplicate vertical. |
| shortcuts.ts `fitView` | Fit view: `["F"]` | Mapped through this work: Fit. |
| shortcuts.ts `deleteNode` | Delete node: `["Delete"]` | Mapped through this work: Delete. |
| shortcuts.ts `deleteNodeBackspace` | Delete node: `["Backspace"]` | Mapped through this work: Delete. |
| shortcuts.ts `resetDefault` | Reset to default: `["Control", "MouseRight"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `groupSelected` | Group selected: `["Control", "G"]` | Mapped through this work: Group selection. |
| shortcuts.ts `moveLeft` | Move left: `["ArrowLeft"]` | Mapped through this work: Move left. |
| shortcuts.ts `moveRight` | Move right: `["ArrowRight"]` | Mapped through this work: Move right. |
| shortcuts.ts `moveUp` | Move up: `["ArrowUp"]` | Mapped through this work: Move up. |
| shortcuts.ts `moveDown` | Move down: `["ArrowDown"]` | Mapped through this work: Move down. |
| shortcuts.ts `bypassNode` | Disable node: `["B"]` | Mapped through this work: Disable toggle. |
| shortcuts.ts `toggleNodeCollapsed` | Collapse / expand node: `["C"]` | Mapped by [F06](#f06-move-resize-rename-select-and-act-on-nodes): Toggle collapse. |
| shortcuts.ts `selectConnectedAll` | Select Connected (All): `["Shift", "C"]` | Mapped through this work: Select all connected. |
| shortcuts.ts `selectConnectedInputs` | Select Connected (Inputs): `["Shift", "I"]` | Mapped through this work: Select inputs. |
| shortcuts.ts `selectConnectedOutputs` | Select Connected (Outputs): `["Shift", "O"]` (the file lists `["Shift", "O"]`; the earlier inventory row was wrong) | Mapped through this work: Select outputs. |
| shortcuts.ts `alignCenter` | Align center: `["Shift", "H"]` | Mapped through this work: Align center. |
| shortcuts.ts `alignRight` | Align right: `["Shift", "ArrowRight"]` | Mapped through this work: Align right. |
| shortcuts.ts `alignTop` | Align top: `["Shift", "ArrowUp"]` | Mapped through this work: Align top. |
| shortcuts.ts `alignMiddle` | Align middle: `["Shift", "E"]` | Mapped through this work: Align middle. |
| shortcuts.ts `alignBottom` | Align bottom: `["Shift", "ArrowDown"]` | Mapped through this work: Align bottom. |
| shortcuts.ts `distributeHorizontal` | Distribute horizontally: `["Shift", "D"]` | Mapped through this work: Distribute horizontally. |
| shortcuts.ts `stackSelected` | Stack selected: `["V"]` | Mapped through this work: Stack selection. |
| shortcuts.ts `arrangeGrid` | Arrange in grid: `["G"]` | Mapped through this work: Arrange grid. |
| shortcuts.ts `deleteSelected` | Delete selected: `["Delete"]` | Mapped through this work: Delete. |
| shortcuts.ts `nodeInfo` | Node info: `["Control", "I"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `openNodeMenu` | Open node menu: `[" "]` | Mapped through this work: Add node. |
| shortcuts.ts `toggleWorkflows` | Workflows: `["1"]` | Mapped through this work: Workflows. |
| shortcuts.ts `toggleAssets` | Assets: `["2"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `toggleInspector` | Inspector: `["I"]` | Mapped through this work: Toggle inspector. |
| shortcuts.ts `toggleWorkflowSettings` | Workflow settings: `["W"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `toggleOperator` | Operator: `["O"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `newChat` | New chat: `["Control", "Shift", "O"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `focusChatComposer` | Focus chat composer: `["Control", "Shift", "L"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `stopChatGeneration` | Stop generation: `["Escape"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `runWorkflow` | Run workflow: `["Control", "Enter"]` | Mapped through this work: Run. |
| shortcuts.ts `stopWorkflow` | Stop workflow: `["Escape"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `saveWorkflow` | Save workflow: `["Control", "S"]` | Mapped through this work: Save. |
| shortcuts.ts `newWorkflow` | New workflow: `["Control", "T"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `closeWorkflow` | Close workflow: `["Control", "W"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `prevTab` | Previous Tab: `["Control", "PageUp"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `nextTab` | Next Tab: `["Control", "PageDown"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `renameAsset` | Rename asset: `["F2"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `assetSelectRange` | Select range: `["Shift", "Click"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `assetToggleSelect` | Toggle selection: `["Control", "Click"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `assetViewerPrev` | Previous asset: `["ArrowLeft"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `assetViewerNext` | Next asset: `["ArrowRight"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `assetViewerPrevJump` | Jump back 5 assets: `["Control", "ArrowLeft"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `assetViewerNextJump` | Jump forward 5 assets: `["Control", "ArrowRight"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `clearAssetSearch` | Clear asset search: `["Control", "Backspace"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `showKeyboardShortcuts` | Show keyboard shortcuts: `["Control", "/"]` | Mapped through this work: Keyboard shortcuts. |
| shortcuts.ts `openSettings` | Open settings: `["Control", ","]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `findInWorkflow` | Find in workflow: `["Control", "F"]` | Mapped through this work: Find node. |
| shortcuts.ts `resetZoom` | Reset zoom: `["Control", "0"]` | Mapped through this work: Reset zoom. |
| shortcuts.ts `zoomIn` | Zoom in: `["Control", "="]` | Mapped through this work: Zoom in. |
| shortcuts.ts `zoomOut` | Zoom out: `["Control", "-"]` | Mapped through this work: Zoom out. |
| shortcuts.ts `zoom50` | Zoom to 50%: `["Control", "Alt", "5"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `zoom100` | Zoom to 100%: `["Control", "Alt", "1"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `zoom200` | Zoom to 200%: `["Control", "Alt", "2"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `navigateNextNode` | Navigate next node: `["Control", "Alt", "N"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `navigatePrevNode` | Navigate previous node: `["Control", "Alt", "P"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `selectFocusedNode` | Select focused node: `["Enter"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `exitNavigationMode` | Exit navigation mode: `["Escape"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `focusNodeUp` | Focus node above: `["Alt", "ArrowUp"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `focusNodeDown` | Focus node below: `["Alt", "ArrowDown"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `focusNodeLeft` | Focus node left: `["Alt", "ArrowLeft"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `focusNodeRight` | Focus node right: `["Alt", "ArrowRight"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `goBack` | Go back: `["Control", "Alt", "B"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `switchToTab1` | Ctrl+1 | Open: native workflow tabs do not switch documents. |
| shortcuts.ts `switchToTab2` | Ctrl+2 | Open: native workflow tabs do not switch documents. |
| shortcuts.ts `switchToTab3` | Ctrl+3 | Open: native workflow tabs do not switch documents. |
| shortcuts.ts `switchToTab4` | Ctrl+4 | Open: native workflow tabs do not switch documents. |
| shortcuts.ts `switchToTab5` | Ctrl+5 | Open: native workflow tabs do not switch documents. |
| shortcuts.ts `switchToTab6` | Ctrl+6 | Open: native workflow tabs do not switch documents. |
| shortcuts.ts `switchToTab7` | Ctrl+7 | Open: native workflow tabs do not switch documents. |
| shortcuts.ts `switchToTab8` | Ctrl+8 | Open: native workflow tabs do not switch documents. |
| shortcuts.ts `switchToTab9` | Ctrl+9 | Open: native workflow tabs do not switch documents. |
| shortcuts.ts add-node hotkeys | Shift+P: Prompt | Open: catalog creation exists, direct type hotkey is not bound. |
| shortcuts.ts add-node hotkeys | Shift+G: Text to Image | Open: catalog creation exists, direct type hotkey is not bound. |
| shortcuts.ts add-node hotkeys | Shift+V: Text to Video | Open: catalog creation exists, direct type hotkey is not bound. |
| shortcuts.ts add-node hotkeys | Shift+L: Agent | Open: catalog creation exists, direct type hotkey is not bound. |
| AssetGridContextMenu.tsx | `assets` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetGridContextMenu.tsx | `createFolder` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetGridContextMenu.tsx | `createFolderIn` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetGridContextMenu.tsx | `folderIn` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetGridContextMenu.tsx | `sortAssetsByDate` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetGridContextMenu.tsx | `sortAssetsByName` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetGridContextMenu.tsx | `sortAssetsBySize` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetGridContextMenu.tsx | `sortByDate` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetGridContextMenu.tsx | `sortByName` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetGridContextMenu.tsx | `sortBySize` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `copyAttribution` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `copyPrompt` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `created` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `creator` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `duration` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `folder` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `id` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `license` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `model` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `name` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `node` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `openAsMade` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `openWorkflow` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `originalPage` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `prompt` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `provider` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `size` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `source` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `task` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `type` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetInfoPanel.tsx | `workflow` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `addToFavorites` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `audioInfo` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `compareImages` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `content` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `copiedToClipboard` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `copyAudioInfo` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `copyAudioMetadata` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `copyContent` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `copyFailed` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `copyImage` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `copyVideoInfo` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `copyVideoMetadata` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `createFolder` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `createTimelineFromVideo` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `delete` | Mapped through this work: Delete. |
| AssetItemContextMenu.tsx | `deleteSelectedAssets` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `downloadFailed` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `downloadFailedDetails` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `downloadFinished` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `downloadSelectedAssets` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `downloadStarted` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `editTimeline` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `folder` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `image` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `moveToExistingFolder` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `moveToNewFolder` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `openAsTab` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `removeFromFavorites` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `rename` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `renameSelectedAssets` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `selectedItems` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `sendToWorkflow` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `starSelectedAssets` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `transformWithWorkflow` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `unstarSelectedAssets` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `untitled` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `useAsEntity` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| AssetItemContextMenu.tsx | `videoInfo` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| ConnectableNodes.tsx | `connectableNodes` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| ConnectableNodes.tsx | `noNodesMatch` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| ConnectableNodes.tsx | `searchNodes` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| ConnectionMatchMenu.tsx | `selectConnection` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| EdgeContextMenu.tsx | `deleteConnection` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| EdgeContextMenu.tsx | `deleteEdge` | Mapped through this work: Delete edge. |
| EdgeContextMenu.tsx | `deleteLink` | Mapped through this work: Delete link. |
| EdgeContextMenu.tsx | `insertReroute` | Mapped through this work: Insert reroute. |
| EdgeContextMenu.tsx | `middleMouseButton` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| EdgeContextMenu.tsx | `orKey` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| EdgeContextMenu.tsx | `orSelectEdgeAndPress` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| EdgeContextMenu.tsx | `selectManyEdgesByHolding` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| EdgeContextMenu.tsx | `whileClicking` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| InputContextMenu.tsx | `clearSearch` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| InputContextMenu.tsx | `constant` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| InputContextMenu.tsx | `createTypedConstant` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| InputContextMenu.tsx | `createTypedInput` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| InputContextMenu.tsx | `createValueWithAI` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| InputContextMenu.tsx | `input` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| InputContextMenu.tsx | `noNodesMatch` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| InputContextMenu.tsx | `prompt` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| InputContextMenu.tsx | `searchConnectableNodes` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| InputContextMenu.tsx | `searchNodes` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `addComment` | Mapped through this work: Add comment. |
| NodeContextMenu.tsx | `collapseNode` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `convertToConstant` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `convertToInput` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `copy` | Mapped through this work: Copy. |
| NodeContextMenu.tsx | `copyNodeAsJson` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `cut` | Mapped through this work: Cut. |
| NodeContextMenu.tsx | `deleteComment` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `deleteNode` | Mapped through this work: Delete. |
| NodeContextMenu.tsx | `disableNode` | Mapped through this work: Disable selected. |
| NodeContextMenu.tsx | `duplicate` | Mapped through this work: Duplicate. |
| NodeContextMenu.tsx | `duplicateVertically` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `enableNode` | Mapped through this work: Enable selected. |
| NodeContextMenu.tsx | `expandNode` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `groupIntoSubgraph` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `nodeChat.chatAboutNode` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `removeFromGroup` | Mapped through this work: Remove from group. |
| NodeContextMenu.tsx | `runNode` | Mapped through this work: Run selected. |
| NodeContextMenu.tsx | `running` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `selectAllNodeType` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `selectAllTypeNodes` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `selectSameTypeNodes` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| NodeContextMenu.tsx | `showTemplates` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| OutputContextMenu.tsx | `clearSearch` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| OutputContextMenu.tsx | `deleteOutput` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| OutputContextMenu.tsx | `missingNodeMetadata` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| OutputContextMenu.tsx | `noNodesMatch` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| OutputContextMenu.tsx | `output` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| OutputContextMenu.tsx | `preview` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| OutputContextMenu.tsx | `reroute` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| OutputContextMenu.tsx | `searchConnectableNodes` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| OutputContextMenu.tsx | `searchNodes` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| OutputContextMenu.tsx | `transformOutput` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PaneContextMenu.tsx | `addApp` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PaneContextMenu.tsx | `addComment` | Mapped through this work: Add comment. |
| PaneContextMenu.tsx | `addConstantNode` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PaneContextMenu.tsx | `addGroup` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PaneContextMenu.tsx | `addInputNode` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PaneContextMenu.tsx | `addNamedNode` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PaneContextMenu.tsx | `addSubgraph` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PaneContextMenu.tsx | `addWorkflow` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PaneContextMenu.tsx | `favorites` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PaneContextMenu.tsx | `fitScreen` | Mapped through this work: Fit. |
| PaneContextMenu.tsx | `holdCAndDrag` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PaneContextMenu.tsx | `inClipboard` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PaneContextMenu.tsx | `noValidNodeData` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PaneContextMenu.tsx | `paste` | Mapped through this work: Paste. |
| PropertyContextMenu.tsx | `copyFailed` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `copyValue` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `declarePropertyAs` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `deleteDynamicProperty` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `hideBottomInput` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `hideBottomInputDisconnect` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `hideTopInput` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `hideTopInputDisconnect` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `noValueToCopy` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `property` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `resetDefaultValue` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `showBottomInput` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `showInputAtBottom` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `showInputHandle` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `showTopInput` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `slotType` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| PropertyContextMenu.tsx | `valueCopied` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `align` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `arrange` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `backspace` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `collapseExpand` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `connected` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `copy` | Mapped through this work: Copy. |
| SelectionContextMenu.tsx | `cut` | Mapped through this work: Cut. |
| SelectionContextMenu.tsx | `delete` | Mapped through this work: Delete. |
| SelectionContextMenu.tsx | `disableAll` | Mapped through this work: Disable selected. |
| SelectionContextMenu.tsx | `disableNodes` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `duplicate` | Mapped through this work: Duplicate. |
| SelectionContextMenu.tsx | `enableAll` | Mapped through this work: Enable selected. |
| SelectionContextMenu.tsx | `enableNodes` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `groupIntoSubgraph` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `nodeChat.chatAboutSelection` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `removeFromGroup` | Mapped through this work: Remove from group. |
| SelectionContextMenu.tsx | `rightClick` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `runSelected` | Mapped through this work: Run selected. |
| SelectionContextMenu.tsx | `selectAllConnected` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `selectInputs` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `selectOutputs` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `selection` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| SelectionContextMenu.tsx | `surroundWithGroup` | Mapped through this work: Group selection. |
| SidebarDocumentContextMenu.tsx | `delete` | Mapped through this work: Delete. |
| SidebarDocumentContextMenu.tsx | `duplicate` | Mapped through this work: Duplicate. |
| SidebarDocumentContextMenu.tsx | `rename` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| WorkflowContextMenu.tsx | `addToFavorites` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| WorkflowContextMenu.tsx | `delete` | Mapped through this work: Delete. |
| WorkflowContextMenu.tsx | `duplicate` | Mapped through this work: Duplicate. |
| WorkflowContextMenu.tsx | `edit` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| WorkflowContextMenu.tsx | `openAsApp` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| WorkflowContextMenu.tsx | `removeFromFavorites` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `alignBottom` | Mapped through this work: Align bottom. |
| CommandMenu.tsx | `alignCenter` | Mapped through this work: Align center. |
| CommandMenu.tsx | `alignLeft` | Mapped through this work: Align left. |
| CommandMenu.tsx | `alignMiddle` | Mapped through this work: Align middle. |
| CommandMenu.tsx | `alignNodes` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `alignNodesWithSpacing` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `alignRight` | Mapped through this work: Align right. |
| CommandMenu.tsx | `alignTop` | Mapped through this work: Align top. |
| CommandMenu.tsx | `autoLayout` | Mapped through this work: Auto layout. |
| CommandMenu.tsx | `cancelWorkflow` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `closeWorkflow` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `copy` | Mapped through this work: Copy. |
| CommandMenu.tsx | `copyWorkflowJson` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `cut` | Mapped through this work: Cut. |
| CommandMenu.tsx | `deleteSelected` | Mapped through this work: Delete. |
| CommandMenu.tsx | `disableSelectedNodes` | Mapped through this work: Disable selected. |
| CommandMenu.tsx | `distributeHorizontally` | Mapped through this work: Distribute horizontally. |
| CommandMenu.tsx | `downloadWorkflowJson` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `duplicate` | Mapped through this work: Duplicate. |
| CommandMenu.tsx | `duplicateVertical` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `exportWorkflowBundle` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `findInWorkflow` | Mapped through this work: Find node. |
| CommandMenu.tsx | `fitView` | Mapped through this work: Fit. |
| CommandMenu.tsx | `groupSelected` | Mapped through this work: Group selection. |
| CommandMenu.tsx | `hideMiniMap` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `importWorkflowBundle` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `importWorkflowJson` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `newWorkflow` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `paste` | Mapped through this work: Paste. |
| CommandMenu.tsx | `redo` | Mapped through this work: Redo. |
| CommandMenu.tsx | `resetZoom` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `runEntireWorkflow` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `saveWorkflow` | Mapped through this work: Save. |
| CommandMenu.tsx | `selectAll` | Mapped through this work: Select all. |
| CommandMenu.tsx | `shareWorkflow` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `showMiniMap` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `snapToGrid` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `toggleAssets` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `toggleConversation` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `toggleInspector` | Mapped through this work: Toggle inspector. |
| CommandMenu.tsx | `toggleWorkflowSettings` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `toggleWorkflowsPanel` | Mapped through this work: Workflows. |
| CommandMenu.tsx | `turnOffSnapToGrid` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| CommandMenu.tsx | `undo` | Mapped through this work: Undo. |
| CommandMenu.tsx | `zoomIn` | Mapped through this work: Zoom in. |
| CommandMenu.tsx | `zoomOut` | Mapped through this work: Zoom out. |
| CommandMenu.tsx | `zoomToPercent` | Open: this exact web action is not exposed by the native menus. Existing inspector functionality, where available, remains separate. |
| FindInWorkflowDialog.tsx | Search title, type, ID and click result | Mapped natively: Find node, with unique-match completion. |
| FindInWorkflowDialog.tsx | Previous/next match, result list and match cycling | Open: native completion does not provide the web result navigator. |
| PaneContextMenu.tsx | Dynamic recent nodes, constant/input type choices | Open: native catalog supports metadata-driven creation, menus do not reproduce these dynamic categories. |
| ConnectionMatchMenu.tsx | Compatible node/port choices | Mapped natively: CompatibleNodePicker, separate from action menus. |


## F40 viewport navigation evidence

The mini-map collects scene node rectangles after scene changes and paints the
viewport from the view transform. Navigation changes the view without document
commands. The viewport strip includes zoom presets and fit selection and moves
above the main toolbar on narrow canvases.

`ViewportNavigatorTest` drives EditorWindow pointer clicks and drags, checks
unchanged document history, loads a large synthetic graph, and replaces the
workflow. Optional `NODETOOL_MINIMAP_CAPTURE` captures the host in both themes
and wide and narrow layouts. Run `ctest --test-dir <build> -R
'^node_editor_viewport_navigator$' --output-on-failure`.

The palette button above the mini-map's top right corner opens "Default colors"
and "Color by type" (`qml/MiniMapControls.qml`, `qml/MiniMapPopups.qml`). Type
mode colors each node by the category that `ColorUtils.ts` assigns and adds a
legend button that opens the six-category legend. The choice is stored under
`minimap/colorMode` and holds for every tab. The zoom readout is primary
colored at every preset, not only 100%. Zoom steps clamp to 0.12 and 4 as React
Flow does, so a step at the edge lands on the limit.

Viewport moves go through `EditorWindow::moveViewTo`. `userAction` marks an
action that the user started, from the status indicator, the command menu, the
pane menu or the zoom presets menu. Those moves animate over
`Metrics.motionNormal` with a cubic in-out ease. Find and Focus use 300 ms,
which the web's `setCenter` calls use and which has no token. Reduced motion
and `action()` move the view at once, so tests and harnesses read the final
view. A wheel, a pan, a middle-button drag or a mini-map drag cancels a
running move. The Focus button in the inspector Help tab, and the "Focus node"
action, center the node's top left corner at 150% over 300 ms, as
`NodeInfoPanel.tsx` does. The programmatic reveal of a selected card still
lands at once.

`ViewportNavigatorTest` covers the colors by pixels in both themes, the menu
and legend through pointer clicks, the persisted mode, the preset highlight,
the zoom clamp, every animated move with its duration and end state, reduced
motion, cancellation by a wheel, Focus from the action and the inspector button,
and the instant programmatic paths. Capture the popups with
`NODETOOL_MINIMAP_CAPTURE`.

Open: the status indicator's step buttons use 200 ms where the web uses 100 ms,
the web's 400 ms and 800 ms fits and the "Show legend" store flag have no
counterpart, the zoom keys and `F` are not bound natively, native fit pads by
0.1 where the status indicator pads by 0.2, the web's reset-zoom shortcut goes
to 50% while native goes to 100%, and exact React Flow mask and drag geometry
is not matched (a mini-map press recenters instead of dragging by delta).
Port-label toggling is not exposed
by the native host. F40 acceptance is pending. Offscreen tests do not verify real-desktop input,
accessibility or high-DPI behavior. Large-graph input-to-paint latency has not
been measured.


## Rich output evidence

Cards select the declared primary output, falling back to the first declared
output as on the web. `src/ui/EditorWindow.cpp` passes the selected run entry to
`src/graph/CanvasMediaPresenter.cpp`. The viewport overlay in
`qml/CanvasMedia.qml` composes the same `qml/RichOutput.qml` used by the panel.
Media collections retain their gallery. Rich content scales with the card,
clips at the viewport and overlapping cards, stays below inline editors, and
releases its component when hidden or fully covered.

[CanvasMediaHostTest](../tests/ui/CanvasMediaHostTest.cpp) injects Markdown,
dataframe and object outputs through EditorWindow's run-output model. It checks
visible card content after zoom and pan, wheel scrolling inside the table
without moving the graph, stable controls while logs arrive, offscreen release,
and rejection of stale output after reset, workflow replacement and account
changes. Document data and undo history remain unchanged. Set
`NODETOOL_RICH_OUTPUT_CAPTURE_DIR` to capture the actual EditorWindow.
The dark and light rich-card captures were each opened and inspected at full
size. Markdown, table cells and object fields are readable in both themes.
The focused canvas-media, canvas-media host and media-gallery host checks pass.

The output panel dispatches dataframes, plain strings and inline text references,
untyped objects, image comparisons, tool-call chunks, and Plotly configuration
objects. Dataframes normalize row records or column/data matrices into a read-only
preview. A scrolling list creates visible rows on demand. The panel labels its
preview bounds. Structured fields dispatch nested values through ObjectOutput, with bounded depth and a shared field budget. Mixed chunk arrays retain text, tool calls and audio dispatch. URI-only text uses the authenticated media resolver, shows loading and retry states, and releases its request when the run or account changes. Tool headers show
the tool name, argument-key summary and optional shortened identifier, with
expandable formatted arguments. They do not invent a completion state.
The panel composes the extracted `qml/RichOutput.qml` component. Markdown and
plain text use proportional body typography. Dataframe headers and rows share label typography and meet without a layout gap.
Columns size to bounded cell content and can be resized by dragging a header edge.
The full-view action opens a read-only window-bounded dialog and returns focus
to its trigger when closed. The explicit preview notice remains in both views. Each matrix row
is fetched once before its cells are read. Markdown uses Qt's Markdown parser, shared link colors, code typography and code surfaces for inline and fenced code. Selecting an HTTP or HTTPS link exposes an explicit Open action. Other schemes cannot open. Tool arguments use formatted JSON in shared MonoCode typography rather than the web syntax highlighter. Comparison images use the existing
authenticated media resolver and decode off the GUI thread. The comparison overlays the images with a wipe in
horizontal and vertical modes. A mouse moves the divider on hover and recenters on
leave. Touch, pen and a pressed mouse drag it and keep the position on release.
Each image fits on its own at natural size without upscaling, over the alpha checker,
with A and B labels and natural dimensions. Switching modes resets the divider.
The dispatcher loads separate image comparison and dataframe components.

`tests/run/RunOutputModelTests.cpp` covers dispatch, unknown typed values and
dataframe bounds. `tests/ui/RichOutputHostTest.cpp` exercises the actual
EditorWindow output panel with separate family fixtures, theme captures, unchanged
document and undo history, and rejection of output after reset. Set
`NODETOOL_RICH_OUTPUT_CAPTURE_DIR` to write the captures.
The host test drives tool expansion, both comparison drag axes, mode switching,
and full-view open and close with pointer events. A wheel event scrolls the
large dataframe while the delegate set stays bounded. These interactions leave
the document and undo history unchanged.
Dark and light dataframe previews, dataframe full views and image comparison
captures were opened individually at full size. The dataframe captures show
contiguous header and body borders with matching text size. The comparison
captures show the two fixture images separated by the moved divider. The focused
renderer host fixtures pass. Native primitive design and dependency checks pass.

Open differences: The native dataframe full view retains the bounded preview
rather than loading omitted rows.
Tool headers still use a flat button instead of the web
badge structure, and arguments have no syntax highlighting. Markdown links and
code blocks retain Qt styling rather than the web styling. Plotly exposes configuration and data instead of a chart.
Streaming PCM has Start, Stop and Restart controls backed by a bounded native playback buffer.
Scoped text references load through the native resolver with retry. Qt Markdown
does not reproduce web reasoning toggles or all web Markdown extensions. Structured previews have bounded depth and field counts. Specialized nested
coverage remains incomplete. Comparison hardware touch and pen input remain
unverified, and the mode button has no tooltip. Complete chunk-array
dispatch remains separate acceptance work. These fixtures do not
verify live server streaming or physical audio output.

### F14 verification limits

Context menus, the shortcuts help and find-node navigation follow the web
sources and are not accepted. The comparison is against the web component
source and its tokens. No live web screenshot was captured, because the web
preview was unavailable to this run.

Web sources and the native owner of each:

- Pane menu: `web/src/components/context_menus/PaneContextMenu.tsx` lines 266-430 and `paneNodeOptions.ts`. Native: `ContextMenuBuilder::pane` in `src/ui/EditorMenus.cpp`.
- Node menu: `NodeContextMenu.tsx` lines 66-254 and `hooks/nodes/useNodeContextMenu.ts`. Native: `ContextMenuBuilder::node`. Groups use this menu, as on the web.
- Selection menu: `SelectionContextMenu.tsx` lines 191-422. Native: `ContextMenuBuilder::selection`.
- Edge menu: `EdgeContextMenu.tsx` lines 127-186. Native: `ContextMenuBuilder::edge`, which now also opens on control edges (delete only), and `::link` for lineage links.
- Shortcuts help: `components/content/Help/KeyboardShortcutsView.tsx` lines 356-420 (platform, layout and category toggles, on-screen keyboard), `keyboard_layouts.ts`, and `ShortcutsSearchableList.tsx` (search and category groups). Native: `qml/ActionPanel.qml` and `qml/ShortcutKeyboard.qml`.
- Find: `components/node_editor/FindInWorkflowDialog.tsx` and `hooks/useFindInWorkflow.ts` lines 121-290. Native: `FindController` and `qml/FindPanel.qml`.

The menus are Qt Quick popups on `Ui.ContextMenu` and `Ui.MenuItem`, hosted on a
transparent overlay widget named `context-menu-host`. Entries, dividers,
section headers, icons, submenus, destructive tone, disabled state with a
reason line, keyboard navigation and stale-document dismissal are covered by
`MenusTest.cpp` with real pointer and key events: pane, node, selection and
edge menus, read-only enablement, Right and Return in a submenu, the help
platform, layout and category controls, and find next, previous, count,
property match, debounce, Escape, outside press and zoom to 100% at the node.
A deliberately wrong Paste enablement failed `paneMenuEntriesAndEnablement`
before restoration. `NODETOOL_MENUS_CAPTURE_DIR` writes pane, pane-submenu,
node, selection, edge, command, shortcuts and find captures in dark and light.

Remaining differences:

- Shortcut hints sit in the row. The web shows them in the hover tooltip. The tooltip opens under the pointer, not to the right of the row.
- Collapse, expand and Collapse / expand are disabled with a reason. The native canvas does not draw collapsed nodes.
- Copy node as JSON copies the whole protocol node. The web copies its node data object.
- Chat about node opens the chat with a draft naming the node. The web also switches the composer to chat mode.
- The pane menu has no Favorites section, because the native editor has no favorites store. Submenus list only node types in the loaded catalog.
- Find highlights no inspector property for a property match, and the web 150 ms debounce is not tied to a live node store.
- Help shows the native bindings, not every web shortcut. The Assets category is empty. The web list shows both platforms at once, the native list follows the platform toggle. Web hover and press tooltips on keys are native tooltips.
- Right-click on an empty selection rectangle and the property, input and output context menus of F03 are unchanged.
- The Command menu and the More dropdown remain the earlier panel and `QMenu`.
- Offscreen tests do not establish platform accessibility, fractional-DPI rendering or real popup behavior.

The shortcut inventory includes surrounding web panels and asset shortcuts. Those remain open when their native surface or binding is absent.


## Group header and comment color evidence

`GroupAuthoringTest` drives EditorWindow pointer clicks on the group Run button,
the header More-menu bypass action and a comment palette swatch. The socket
fixture decodes the submitted MsgPack request and checks that an unselected
group submits its runnable child. Bypass and color changes each add one undo
entry. The color test saves and reopens the workflow and rejects stale workflow
and credential epochs. The group presentation and partial planner tests also pass.

The viewport Quick controls follow projected frame positions and the web action
zoom exponent. Comment colors reuse `PropertyPresets.js`, which mirrors the web
palette, and persist in `data.comment_color`. The document command changes only
that field. Set `NODETOOL_GROUP_CAPTURE_DIR` to write `group-dark.png`,
`group-light.png`, `comment-dark.png` and `comment-light.png` from the actual
EditorWindow. The selected green
comment remains visible in both themes.

The native shared buttons retain their native shape. Exact web circular group
buttons, comment trigger sizing and hover opacity, and the group-color menu
control remain open. These focused tests do not establish real-platform popup
behavior, high-DPI rendering, read-only transition coverage, or nested-group
pointer-run request coverage.


## F06 move, resize, rename, select and act on nodes

Web sources: [BaseNode.tsx](../../../web/src/components/node/BaseNode.tsx),
[NodeHeader.tsx](../../../web/src/components/node/NodeHeader.tsx),
[NodeResizeHandle.tsx](../../../web/src/components/node/NodeResizeHandle.tsx),
[EditableTitle.tsx](../../../web/src/components/node/EditableTitle.tsx),
[NodeSelectionToolbar.tsx](../../../web/src/components/node/NodeSelectionToolbar.tsx),
[NodeToolButtons.tsx](../../../web/src/components/node/NodeToolButtons.tsx),
[useToggleCollapse.ts](../../../web/src/hooks/nodes/useToggleCollapse.ts) and
[collapsed.css](../../../web/src/styles/collapsed.css). Status is from reading
the native code and the tests named in the last column. `I` is implemented, `P`
is partial and `M` is missing.

| ID | Web behavior (file and lines) | Native | Evidence and remaining difference |
|---|---|---|---|
| F06.1 | A header click selects the card (`NodeHeader.tsx` 181-183). Ctrl or Shift click adds, a box selects, Ctrl+A selects all. | I | `SelectionPresentationTest`, `NavigationTest`. |
| F06.2 | Drag moves the card and the selection. The gesture is one undo step (`useDragHandlers.ts` 153-172). | I | `EditorWindow::eventFilter` batches the release. `GroupAuthoringTest::keyboardGroupingAndNestedMovement`. |
| F06.3 | Arrow keys nudge the selection (`useNodeEditorShortcuts.ts`). | I | 10 px steps, one undo step each. `GroupAuthoringTest`. |
| F06.4 | Edges and corners resize a selected card. Minimum width 200 for edges and 150 for the corner, maximum 800, height at least `max(150, min(handles × 25, 320))` (`BaseNode.tsx` 90-93, 119-150, 282-296, 768-773). One undo step (`NodeResizeHandle.tsx` 90, 115-116). | P | `GroupPresentationTest::ordinaryNodeResizeBounds`. Widths match. Native keeps every control visible, so the minimum height is the natural content height, not 150. |
| F06.5 | Media cards lock the media aspect ratio while resizing (`NodeResizeHandle.tsx` 92-107, `MediaAspectResizeControl`). | M | Open. Native resizes freely. The Resize Image lock is a separate body control. |
| F06.6 | A Code node's header title edits in place on double-click. Enter commits, Escape restores, a blur commits. A blank draft or the metadata title stores nothing (`NodeHeader.tsx` 208-246, 309-319). Other nodes have no header edit. | I | New. `NodeActionsTest::codeHeaderRenamesInPlace`. The editor is single-line over the header. |
| F06.7 | A note under the card (`data.title`) edits on double-click. Enter commits, Shift+Enter adds a line, Escape cancels, a blur commits, the hover X removes it (`EditableTitle.tsx` 214-253). | I | `InlineTitleTest::noteCommitEscapeBlurAndRemove`. Emoji and keycap styling is missing. |
| F06.8 | Double-click on the header icon or title collapses or expands the card (`NodeHeader.tsx` 190-197, 220-232). C and the context menus do the same through `useToggleCollapse.ts` 14-43. The first card's next state drives the whole selection and the change is one undo step. | I | New. `NodeActionsTest::headerDoubleClickCollapsesAndExpands`, `cKeyCollapsesTheSelectionUniformly`, `nodeMenuCollapsesAndNamesTheState`. A subgraph header double-click now collapses, as on the web, and its footer opens the child. |
| F06.9 | A collapsed card is a 40 px strip at least 140 px wide, as wide as its header. Sockets sit on the midline, nothing else draws. The expanded size is kept (`collapsed.css` 1-120, `vars.css` 88-94, `collapseNodeLayout.ts` 92-174). | I | `collapsedLayout` in `WorkflowGraphModel.cpp`. Native keeps the stored width and height in `ui_properties` and adds no `expandedHeightPx`. The strip width comes from the header text. The strip has no resize handle. `NodeActionsTest::collapsedCardPaintsAsAStrip`. |
| F06.10 | A selected single card shows a toolbar above it: Run, Disable, Duplicate, Chat and More (`NodeSelectionToolbar.tsx` 144-163, `NodeToolButtons.tsx` 143-306). It is centered with an 8 px gap, which the web capture measures from the toolbar border at y 356 to the card ring at y 364. | I | New. `NodeActionsTest::toolbarFloatsAboveTheSelectedCard`. Run is Run selected, which plans from the selection with the same builder as the web Run from here (`useRunFromHere.ts`). A lone card Run is an independent job that stays enabled during another run (`NodeActionsTest::runNodeStartsAnIndependentJobDuringAnActiveRun`), and Disable follows the web majority rule (`NodeActionsTest::bKeyAndToolbarFollowTheBypassMajority`). Acceptance pending. |
| F06.11 | The toolbar follows the card through pan and zoom (React Flow `NodeToolbar`). It is hidden while the card drags or a dropdown is open and shows again 200 ms after the selection settles. | I | New. `toolbarFollowsPanZoomAndGeometry`, `toolbarHidesWhileTheCardDrags`, `toolbarShowsTwoHundredMillisecondsAfterTheSelection`, `toolbarHidesWhileADropdownIsOpen`. The `activeSelect` the web reads is the dropdown store (`hooks/nodes/useSelect.ts`), not a box selection, so there is no box-select rule to port. A toolbar that would leave the canvas is held inside it. Acceptance pending. |
| F06.12 | More opens a menu with Remove from group, Convert, Add or Delete comment, Show templates, Select same type, Copy as JSON and Delete (`NodeToolButtons.tsx` 236-306). | I | The button opens the native node context menu, which holds these and more. `moreButtonOpensTheNodeMenu`. |
| F06.13 | Chat about the node opens the chat with a draft that names it (`useChatAboutNodes`). | I | `chatButtonOpensTheChat`. |
| F06.14 | Disable and Enable toggle the card. A disabled card shows a Disabled chip (`NodeHeader.tsx` 345-352). B toggles. | I | `toolbarDisableAndDuplicate`. The chip is 24 px high with 8 px label padding and a 1 px border at 50 percent, filled at 12 percent, with a 6 px margin before it (W31). |
| F06.15 | Read-only: no edits. | I | Run, Disable and Duplicate disable. The collapse action and the header edits refuse. `MenusTest::nodeMenuReadOnlyDisablesEdits`. |
| F06.16 | Right-click on the header opens the node menu (`NodeHeader.tsx` 166-179). | I | `MenusTest`. |
| F06.17 | The web's `SelectionActionToolbar` (Arrange, Run, Duplicate, Group, Link, Disable, Delete at the canvas top) is not mounted by any web component. | P | Native keeps it for a group, a comment and several nodes. It is a native extra. |

## F07 groups

Web sources: [GroupNode.tsx](../../../web/src/components/node/GroupNode.tsx),
[RunGroupButton.tsx](../../../web/src/components/node/RunGroupButton.tsx),
[BypassGroupButton.tsx](../../../web/src/components/node/BypassGroupButton.tsx),
[useSurroundWithGroup.ts](../../../web/src/hooks/nodes/useSurroundWithGroup.ts),
[useAddToGroup.ts](../../../web/src/hooks/nodes/useAddToGroup.ts),
[useRemoveFromGroup.ts](../../../web/src/hooks/nodes/useRemoveFromGroup.ts),
[useDragHandlers.ts](../../../web/src/hooks/handlers/useDragHandlers.ts) and
[MousePosition.ts](../../../web/src/utils/MousePosition.ts).

| ID | Web behavior (file and lines) | Native | Evidence and remaining difference |
|---|---|---|---|
| F07.1 | Ctrl+G, the toolbar and the context menu surround two or more cards with a group at (minX − 20, minY − 50), sized to the cards plus 40 and at least 200. Children keep their canvas place and the change is one undo step (`useSurroundWithGroup.ts`). | I | `groupNodes` in `WorkflowDocument.cpp`. `GroupAuthoringTest::keyboardGroupingAndNestedMovement`. The web skips group nodes, native also wraps nested frames. |
| F07.2 | The label is plain text above the frame, scaled with the zoom. A double-click edits it, and the edit saves 500 ms after the last key (`GroupNode.tsx` 401-418, 599-624). | I | `InlineTitleTest::groupHeadlineAndCommentIsolation`, `GroupPresentationTest::labelZoomMatchesWeb`. Native commits once on Enter or blur. |
| F07.3 | The frame ignores the pointer. Only the label selects and drags the group (`GroupNode.tsx` 521-534). | P | Native selects and drags a group from its body too. Open. |
| F07.4 | Moving a group moves its children (`GroupNode`, React Flow parent). | I | `GroupAuthoringTest::createGroupEditAndUndo`. |
| F07.5 | Resize handle and edges, minimum 200 × 200, children stay where they are (`GroupNode.tsx` 53-54, 389-399, 693-698). | I | `GroupPresentationTest::resizeCommitsOnceAndPreservesChildren`. |
| F07.6 | Header actions show on header hover or selection: More and Run (`GroupNode.tsx` 494, 626-647). Run runs the children through Run selected (343-349). | I | `GroupAuthoringTest::pointerRunSubmitsGroupWithoutSelectingIt`, which also checks the spinner and the "Group is running" name (`RunGroupButton.tsx`). Disabled cards: `NodeActionsTest::disabledCardPaintsStripesAndAWarningBadge`. Bypass exclusion: `PartialRunPlannerTest::bypassedNodesLeaveWithTheirIncidentEdges`. Acceptance pending. |
| F07.7 | The menu holds Disable all or Enable all, shown only with children, and a color picker (`GroupNode.tsx` 649-678, 351-363). Bypass is one undo step. | P | `pointerBypassAndColorRoundTrip`. Native has the web swatches. Custom colors are missing. |
| F07.8 | Dropping a card on a group moves it in and keeps its canvas position. The group grows to hold it with 25 px right and 50 px below, and never shrinks (`useDragHandlers.ts` 113-138, 153-172, `useAddToGroup.ts`). Cards that already have a group stay. Groups never join groups. | I | New. `GroupAuthoringTest::dropOnGroupJoinsKeepsPlaceGrowsAndUndoesOnce`, `dropOutsideEveryGroupLeavesTheCardLoose`, `groupedCardDroppedInsideItsGroupStaysGrouped`. The drop and the growth are one undo step. Native joins the smallest overlapping group, the web the first. |
| F07.9 | The group a dragged card overlaps draws at 0.8 opacity with a 60 percent primary edge (`GroupNode.tsx` 521-534). | I | New. `dropTargetGroupHighlightsWhileDragging`. |
| F07.10 | Alt while dragging takes the cards out of their group. A quick shake does the same (`useDragHandlers.ts` 94-104, `MousePosition.ts` 12-91). Cards keep their canvas place. | I | New. `altDragTakesTheCardOutOfItsGroup`, `shakingTheCardTakesItOutOfItsGroup`, `steadyDragIsNotAShake`, `dragWithoutAltKeepsTheGroup`. `DragWiggle.h` ports the detector. The out and in steps are one undo step. |
| F07.11 | Remove from group is in the node More menu (`NodeToolButtons.tsx` 105-109, 250-256) and sets a card loose at its canvas place (`useRemoveFromGroup.ts`). | I | `GroupAuthoringTest::createGroupEditAndUndo`. Native also has Ungroup, which the web lacks. |
| F07.12 | While a group has a selected child and Ctrl or Cmd is held, the group becomes selectable and dimmed so a box can start inside it (`GroupNode.tsx` 480-489). | M | Open. |
| F07.13 | A help hint above the group lists how to remove nodes (`GroupNode.tsx` 681-691). | M | Open on purpose. The web text says Ctrl or Cmd while the code uses Alt, so native does not copy it. |
| F07.14 | Read-only: no group edits. | I | `pointerColorIsBlockedAfterReadOnlyTransition`. The drag outcome is ignored when read-only. |

## F08 comments

Web source: [CommentNode.tsx](../../../web/src/components/node/CommentNode.tsx).

| ID | Web behavior (file and lines) | Native | Evidence and remaining difference |
|---|---|---|---|
| F08.1 | Add comment from the pane menu. | I | `MenusTest::paneMenuEntriesAndEnablement`. A 300 × 160 card. |
| F08.2 | The text edits in place in a Lexical editor with a format toolbar (`CommentNode.tsx` 260-286, 453-489). | P | Markdown text edits in place on double-click or Edit comment. Enter adds a line, Ctrl+Enter or a blur stores, Escape discards. `InlineTitleTest::commentEditsInPlaceAndRefitsTheCard`. Rich-text formatting and the format toolbar are missing. A Lexical comment stays view-only so its formatting is never flattened. `richTextCommentStaysViewOnly`. |
| F08.3 | The text saves 500 ms after the last key and on unmount (`CommentNode.tsx` 320-334). | P | Native stores once, on Ctrl+Enter or blur. |
| F08.4 | A blur after a change scales the card to the text: width 100 to 600, height at least 40 (`CommentNode.tsx` 359-424). | P | Native refits the height to the text, at least 40, in the same undo step as the text. The width is unchanged. |
| F08.5 | The corner handle resizes with a 30 × 40 minimum. One undo step (`CommentNode.tsx` 485). | I | `GroupPresentationTest::ordinaryNodeResizeBounds`. |
| F08.6 | The color picker has the web swatches and no custom color. `null` is the default. The text color follows the background contrast (`CommentNode.tsx` 248-293, 426-450). | I | `GroupAuthoringTest::pointerBypassAndColorRoundTrip`. |
| F08.7 | A double-click anywhere on the card edits the text. | I | New. `InlineTitleTest::groupHeadlineAndCommentIsolation`. |
| F08.8 | Copy, paste, duplicate, delete, undo, save and reopen. | I | Document commands. `GroupAuthoringTest::createGroupEditAndUndo`. |
| F08.9 | Read-only: no edits, no color change. | I | `pointerColorIsBlockedAfterReadOnlyTransition`. The inline editor refuses in read-only mode. |

### Evidence for F06, F07 and F08

Set `NODETOOL_NODE_ACTIONS_CAPTURE_DIR` for the toolbar and collapsed captures,
`NODETOOL_GROUP_CAPTURE_DIR` for the group and drop-target captures and
`NODETOOL_WINDOW_PARITY_CAPTURE_DIR` for the selected-state window capture.
The native `selected-*` captures at 1440×900 in both themes were opened and
compared with the web captures. The web toolbar floats centered over the Agent
card with a primary Run button, then Disable, Duplicate, Chat and More. The
native toolbar sits in the same place with the same five controls. The native
buttons are flat primitives, so their ink differs slightly from the web icons.
The collapsed captures show a 40 px strip with its sockets on the midline in
both themes.

### F31 streaming PCM evidence

The output panel and canvas use stable per-output PCM controllers scoped by
account, session, job, node and output. They recognize PCM16 little-endian,
float32 little-endian and the provider PCM sample-rate aliases. An application
FIFO coordinates playback across windows without preempting the current stream.
The AudioOutput node uses a bounded live buffer that drops stale frames. Generic
output retains bounded replay data. Done drains accepted audio before promotion.
Stop, cancellation, replacement and fatal errors release the relevant queue slot.

[src/media/PcmStream](../src/media/PcmStream.h) negotiates device sample format,
rate and mono/stereo channels. Conversion preserves interpolation across chunks.
Unwritten converted bytes survive short device writes. Live lead includes source,
converted and device-buffered frames. Compressed MP3 and Opus remain explicitly
unsupported in production. Missing devices and invalid metadata show an error.

[PCM tests](../tests/media/PcmStreamTest.cpp) exercise injected sinks, conversion,
backpressure, FIFO order, replay, bounded live lead and teardown.
[Run-output tests](../tests/run/RunOutputModelTests.cpp) cover independent streams,
sequence deduplication, scope invalidation and bounded history retaining active
controls. [Rich-output host tests](../tests/ui/RichOutputHostTest.cpp) drive actual
Start, Stop and Restart controls, including arrivals while Stop is held, and
check controller ownership through QML garbage collection. Incremental rich rows
preserve the pressed delegate when sibling output arrives.

Live PCM now uses [LiveAudioVisualizer](../src/media/LiveAudioVisualizer.h) in
both the card and output panel. A fixed sample window produces frequency bars
and a waveform from complete sink-accepted frames. Views share analysis and
observe only while visible in the active window. Reduced motion captures a
static signal and uses a one-shot expiry to clear starvation. Stop, replacement
and scope teardown clear the visual. [Visualizer tests](../tests/media/LiveAudioVisualizerTest.cpp)
cover accepted partial writes, output formats, queued silence, stale expiry,
resumption and fixed storage. Actual Quick-widget framebuffer regions change
with tone frequency and clear after Stop in dark and light host captures.

Remaining F31 work includes compressed streaming, provider-framing acceptance
and physical-device playback. The retained-controller
limit needs clearer capacity feedback and recovery. The rendered signal does not
establish physical playback or complete visual parity. Offscreen fake sinks establish byte delivery and lifecycle
behavior, not audible output, hardware latency or device-removal recovery. See
[streaming audio design](streaming-audio-parity.md),
[live visualization design](live-audio-visual-parity.md) and
[compressed audio design](compressed-audio-parity.md).

### F33 operation-level server merge

| Behavior | Web | Native | Status |
|---|---|---|---|
| Notice with `ops` on a dirty draft | `mergeExternalGraph` in [WorkflowManagerStore.ts](../../../web/src/stores/WorkflowManagerStore.ts) merges against the last server copy | `WorkflowSession` merges against its persisted snapshot through [WorkflowMerge](../src/document/WorkflowMerge.cpp) | Matches |
| Notice without `ops` | One whole-document conflict | The existing whole-workflow comparison | Matches |
| Merge units | Nodes and edges by ID, node `position`, `data` and remaining fields as separate slots ([workflowMerge.ts](../../../web/src/stores/workflowMerge.ts)) | The same slots on persisted nodes. The data group holds `data`, the dynamic slot fields and the `ui_properties` fields the web copies into ReactFlow node data | Matches |
| Contest | The draft wins. A conflict is listed only for a unit an op touched. Unattributed ops count every contested unit ([documentMerge.ts](../../../web/src/stores/documentMerge.ts)) | Same | Matches |
| Deletes and dangling edges | A delete against an edited unit keeps the draft and lists a conflict. Dangling edges are dropped and listed | Same | Matches |
| Lineage links | `mergeGraphLinks` | Same rule | Matches |
| Applying the merge | No undo entry. Writes continue | One "Merge server changes" undo step. Writes pause only when a conflict is listed | Differs by design |
| Conflict review | Per-unit banner with accept and discard ([useDocumentConflicts.ts](../../../web/src/hooks/useDocumentConflicts.ts)) | The existing Server sync dialog lists each conflict in the web's wording, with whole-workflow **Keep local version** and **Reload server version** | Partial |

[WorkflowMergeTest](../tests/document/WorkflowMergeTest.cpp) covers the merge
rules, unknown members and the single undo step.
[WorkflowAutosaveTests](../tests/server/WorkflowAutosaveTests.cpp) covers merged
and conflicting notices over fake HTTP and MsgPack, the host applier, and a stale
autosave that waits for the merge. [ServerSyncHostTest](../tests/ui/ServerSyncHostTest.cpp)
covers the editor's undo step and the listed conflict. See
[Server workflow synchronization](server-document-sync.md#operation-level-merge).
Acceptance pending.

### F37 workflow versions, sharing and metadata

**Version history**, **Share workflow** and **Workflow metadata** are available
from More and the command menu. [WorkflowVersions](../src/server/WorkflowVersions.cpp)
uses the authenticated workflow tRPC endpoints. Local files without an explicit
server binding show an unavailable state. Credential changes and document
replacement invalidate pending requests and close the panels.

[VersionHistoryPanel](../qml/VersionHistoryPanel.qml) opens in the bottom dock,
where the web hosts history. Opening history hides the output dock so history
can use the bottom area's width. Rows show a graph thumbnail, version number,
a save-type label (Manual, Auto, Restored or Checkpoint, from `getSaveType` in
[VersionHistoryPanel.tsx](../../../web/src/components/version/VersionHistoryPanel.tsx)),
a relative time, serialized graph size and description. The full time is a
tooltip on the relative time, as in
[VersionListItem.tsx](../../../web/src/components/version/VersionListItem.tsx)
lines 103 to 140. Selected rows expose restore and delete actions.
Deletion asks for confirmation and uses the authenticated version endpoint.

The All, Manual and Auto filter and the Compare toggle follow
[VersionHistoryPanel.tsx](../../../web/src/components/version/VersionHistoryPanel.tsx)
(`filterType` and `handleFilterChange`, `handleToggleCompareMode`, `handleCompare`
and `handleClearComparison`). Auto shows `autosave` rows only, so checkpoints and
restores appear under All. The count in the header follows the filter. A filter with
no matches shows the web's "No versions saved yet" state. In compare mode the first
click picks the first version, the second click picks the second, clicking the
picked version clears the selection, and Clear leaves compare mode. A banner asks
for the first or second version, as the web's does. The lower version number is the
older side whichever was picked first. Comparing two versions draws the visual diff
in the preview's place and lists the changes below it in the order of the web's
`VersionDiff`: added nodes, removed nodes, changed nodes, then connections. Outside
compare mode the pane keeps its native diff of the current document against the
inspected version, which the web does not have.

[VersionGraphPreview](../qml/VersionGraphPreview.qml) draws the inspected
snapshot without loading it into the editable document. The inspected preview
pans by dragging and zooms with the wheel about the cursor, between the web's
zoom limits of 0.02 and 1.5 and with the web's fit-on-selection behavior
([WorkflowGraphPreview.tsx](../../../web/src/components/version/WorkflowGraphPreview.tsx)
lines 92 to 111). List thumbnails stay fixed, as the web's mini previews do.
In compare mode the same item draws
[GraphVisualDiff.tsx](../../../web/src/components/version/GraphVisualDiff.tsx):
nodes of both graphs on its grid, newer graph first, with the web's styling.
Added nodes and connections use the success colour, removed ones the error colour
at reduced opacity with dashed connections, changed nodes the warning colour, and
unchanged ones the muted fill. Changed nodes carry the corner dot and a legend
counts added, removed and changed nodes. An empty diff shows "No changes to
display". The web draws only the newer graph's nodes, so a removed node never
appears there although its status styling exists. Native draws removed nodes too.
Inspection and comparison
preserve the snapshot, undo index and dirty state. The controller compares the
selected version against another saved version or the current document.
Its cached, hash-indexed diff reports added and removed nodes and connections,
changed node properties with before/after values, and changed connection fields.
Selection and stacking order do not count as node edits. The unit test exercises
large graphs as well as dynamic properties and connection handles.

Version inspection shows a read-only graph without changing the document.
Restoring requires explicit confirmation when work is dirty. It pauses autosave,
blocks overlapping saves, calls the server restore endpoint, replaces the graph
through an undo command and adopts the returned revision. Undo retains current
server identity and metadata. Edits made during the request stay local and cause
a server comparison instead of being overwritten. Saves or unresolved conflicts
block restore. The session refreshes the server after completion before further
autosave writes.

Sharing lists owner-visible links and collaborators. The panel shows what
[ShareDocumentDialog.tsx](../../../web/src/components/sharing/ShareDocumentDialog.tsx)
lines 164 to 290 shows and no server response: the title with the workflow name, the
description, three copy buttons, "Active links" with a role chip, a copy action and
Revoke for each link, and "People with access" with a role select and Remove access,
or the empty state. The panel never prints a token or a link's URL, as the web does
not. The panel creates viewer,
editor and public links, reloads the list and copies each new URL to the clipboard at once, as
`handleCreateLink` in
[ShareDocumentDialog.tsx](../../../web/src/components/sharing/ShareDocumentDialog.tsx)
lines 109 to 139 does. Each listed link has a copy action that shows "Copied"
for two seconds. `QClipboard` reports no write failure, so there is no failure notice like the web's. The panel also revokes links, changes roles and
removes collaborators. Permission failures remain visible. The server enforces
editor access for history and owner access for sharing in
[the workflow router](../../../packages/websocket/src/trpc/routers/workflows.ts).

Metadata edits merge into the current snapshot and use the existing full save,
preserving graph edits and untouched metadata. Save responses retain locally
held extension fields omitted by the server. Arbitrary root extension metadata
cannot persist on the server: `workflowBody` and `updateInput` in
[the workflow schemas](../../../packages/protocol/src/api-schemas/workflows.ts)
strip unknown root fields. The `settings` object accepts unknown members.
There is no endpoint for persisting arbitrary workflow root fields.

[WorkflowVersionsTests](../tests/server/WorkflowVersionsTests.cpp) covers list,
empty, invalid response, permission denial, local unavailability, delayed
responses crossing document detachment and account changes, read-only inspection and graph undo.
[VersionHistoryPolishTest](../tests/ui/VersionHistoryPolishTest.cpp) uses a fake
server that returns the `versionResponse` and `shareItem` shapes from
[the workflow schemas](../../../packages/protocol/src/api-schemas/workflows.ts)
and tRPC error bodies with their HTTP status. It covers named version creation
through `workflows.versions.create`, including the local save that must reach the
server first, a blank name, a create failure with retry and a failed local save
that sends no create. It also covers relative times at fixed ages including calendar
months and years, labels that advance with an injected clock, wheel zoom about
the cursor with the web's limits, drag pan, refit on selection, copy to the
clipboard from both share actions, and the absence of wrapped or clipped button
labels at the dock's minimum width. Removing the pre-save, or sending `title`
instead of `name`, made the creation test fail, and the original code was restored.
The same suite also covers the share panel's content with a revoke click, the
order of the diff sections and of the items in them, the filter, the empty state,
compare mode with the visual diff's pixels, a delete reply that arrives after
Share was opened, the checkpoint before a run (its request body, the wait, a
failure and an empty graph) and the dock minimum after a UI scale change. Iterating
the diff in hash order failed the two order tests, dropping the panel check on the
queued reload and the late reply failed the delete test, running without the
checkpoint failed the checkpoint test, and removing the dock's follow of the
panel's minimum failed the scale test. The original code was restored each time.
[WorkflowVersionsHostTest](../tests/ui/WorkflowVersionsHostTest.cpp) uses real
pointer events through EditorWindow for version selection, saved-version comparison,
dirty protection, restore, toolbar undo, canceled and confirmed deletion, sharing failure and link creation, and metadata rename persistence.
`NODETOOL_VERSIONS_CAPTURE_DIR` enables dark and light captures from both suites without
assuming an output directory. History captures include the actual EditorWindow,
with the canvas, history list, preview, comparison and dirty-work warning.
The history, filter, compare and sharing images were opened at full size for
visual inspection in both schemes. Metadata retains its separate dialog capture.
The compare capture shows the visual diff with one added, one removed and one
changed node, an added and a removed connection, and the legend. It differs from
the web in layout: the web's compare pane has no Restore or Delete and puts a
caption above the canvas, where native keeps its inspected-version header and
actions above the diff heading. Native node labels use the type's last segment and
the web's 10 px bold label becomes the caption type role.

**Save version** is in the history header. It asks for an optional name, sends
local edits through the normal save, then calls `workflows.versions.create` with
`id` and `name` ([the router](../../../packages/websocket/src/trpc/routers/workflows.ts)
lines 788 to 807). The web's workflow history panel has no such control. The
operation exists in `useWorkflowVersions.ts` line 40 and the web timeline history
offers it through a name dialog
([TimelineVersionHistoryPanel.tsx](../../../web/src/components/timeline/TimelineVersionHistoryPanel.tsx)
lines 217 to 225), so native follows that flow. The workflow panel does not use
it. The web creates the other checkpoint kind, `save_type: "checkpoint"` with the
description "Before execution", through `workflows.autosave` before a run
([useFloatingToolbarActions.ts](../../../web/src/hooks/useFloatingToolbarActions.ts)
lines 156 to 180). Native sends it too. `WorkflowSession::checkpointBeforeRun`
runs from the Run action: a forced `workflows.autosave` with
`save_type: "checkpoint"`, the description "Before execution", `client_id: "system"`,
`max_versions: 50` and the current `expected_updated_at`, skipped for a graph with no
nodes. The run starts when that one reply arrives, as the web's does after
`await queueWorkflowSave`. A save in flight finishes first, as the web queues it, and
the returned `updated_at` and `etag` become the session's revision so the next save is
not a conflict. A failed or rate-limited checkpoint does not stop the run. A 409 raises
the usual conflict. A graph with metadata that autosave cannot preserve skips the
checkpoint. Native has no `saveBeforeRun` setting, so the checkpoint is always on, which is the web's
default. The web's other run paths, running selected nodes and chat runs, send none and
neither does native. A failed local
save or a failed create keeps the error visible and leaves the document and
version list unchanged. The server stores the new row as `manual`, selects the
new row after the list reloads and the label reads Manual.

Relative times follow `relativeTime` in
[formatDateAndTime.ts](../../../web/src/utils/formatDateAndTime.ts) lines 93 to
134, with calendar months and years. Labels recompute from a clock that ticks
every second during a version's first minute and every 15 seconds afterward.
The web computes them at render time and does not tick. Absolute times use
`MMM d, yyyy, h:mm` in the system locale, which approximates the web's
`Intl.DateTimeFormat` options in `formatUtils.ts` lines 129 to 135.

The dock's minimum width comes from the panel's own layout and the editor
window applies it, so a narrower window cannot wrap or clip header, row, filter,
restore or compare buttons. The panel reports its minimum to the controller, and
the dock follows each change, so a UI scale change updates it. The history stays
open at that width and the window stops narrowing instead of wrapping.

A reload that follows a delete, a link change or a created version is queued after
the reply. `WorkflowVersions` records the panel the last load served and drops a
queued reload or a late reply for another panel, so a Share panel opened during a
delete keeps its own data.

Native metadata fields commit on editing completion rather than the web's
text debounce. Workspace selection uses an ID field instead of a workspace
picker, and tags use a comma-separated field instead of suggestions. The web's
version list filter and compare toggle are ported. The native preview uses
simple labeled node rectangles and straight connections without the web's full
node renderers, property widgets or group styling, and has no pan or zoom
controls beyond drag and wheel (no pinch gesture). The visual diff has no per-node
tooltip. Rows expose actions on
selection rather than hover. Diff properties remain expanded rather than using web
accordions, and native lists changed connections and property values in full where
the web truncates values to 50 characters. Keys inside a changed node are sorted by
name because `QJsonObject` does not keep member order, where the web keeps the
order of the JSON. The web shows no copy control for a
version's content, so none was added. Sharing does not verify link redemption.
Absolute times in the list appear only in a tooltip, so touch input cannot read
them. Live server verification and browser redemption of share links remain
unverified. The native captures were not compared with a live web screenshot
because no web build was served. The comparison used the web components' source
layout.

An AddressSanitizer build of `node_editor_versions_host_tests` with `detect_leaks=1`
reports 462064 bytes in 10865 allocations. All 181 leak records come from the GTK 3
platform theme: `libqgtk3.so`, GTK 3, Pango, FontConfig and GLib allocations made while
`QApplication` is constructed (`QPlatformThemeFactory::create`). The only frame from
this repository in any of them is `main`. The machine sets `QT_QPA_PLATFORMTHEME=gtk3`,
and the same run with `QT_QPA_PLATFORMTHEME=generic` passes with no leak report. The
versions code leaks nothing, so there was nothing to fix there. Leak checks of
offscreen tests should set `QT_QPA_PLATFORMTHEME=generic`.

Run the focused targets with the configured native build directory:

```sh
cmake --build "$NODE_EDITOR_BUILD_DIR" --target node_editor_versions_tests node_editor_versions_host_tests node_editor_version_history_polish_tests --parallel 3
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software "$NODE_EDITOR_BUILD_DIR/node_editor_versions_tests"
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software "$NODE_EDITOR_BUILD_DIR/node_editor_versions_host_tests"
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software "$NODE_EDITOR_BUILD_DIR/node_editor_version_history_polish_tests"
```


## Code property editing and inferred ports

[CodePropertyEditor](../qml/CodePropertyEditor.qml) serves the inspector and
canvas property popover. It uses shared monospace typography and theme tokens,
visible line numbers, and a block-based QSyntaxHighlighter. Tab inserts spaces.
Focus loss commits the draft. Escape restores its stored value. Non-Code
executors expose an expanded editor. Canvas shortcuts do not act while typing.
Monaco completion and semantic diagnostics remain web-only.

[CodeInference](../src/properties/CodeInference.cpp) runs the bundled Acorn
parser without executing source. Its rules follow the web
[code inference helper](../../../web/src/utils/codeOutputInference.ts): named
input and stream reads accumulate inputs, explicit emissions take precedence
over object returns, and the last object return determines output names.
Bindings that shadow the input sources suppress inference from that source.
Comments, strings, dynamic reads, and malformed source do not invent handles.
Malformed source preserves existing ports. Connected outputs retain their types
and edges when the source stops naming them. Property source and inferred port
changes share the document command and undo transaction. Imported source also
exposes inferred ports before an edit.

[CodePropertyTest](../tests/ui/CodePropertyTest.cpp) exercises inference from
web cases, real EditorWindow typing and pointer connection, retained edges,
undo, Escape, file round trip, and typing into a large source draft. Run
`ctest --test-dir <build> -R '^node_editor_code_property$' --output-on-failure`.
Set `NODETOOL_CODE_CAPTURE_DIR` to capture dark and light EditorWindow images.


## F35 workflow document tabs

[EditorTabs](../src/ui/EditorTabs.cpp) retains an
[EditorWindow](../src/ui/EditorWindow.cpp) for each workflow document inside a
stacked host. Each retained editor owns its document, undo stack, graph model,
scene, viewport, selection, session, autosave, media controllers and run output.
Switching changes visibility and cancels unfinished editing gestures without
projecting another graph or changing document history. Background sessions
continue receiving their own run events. Closing destroys the originating
controllers and invalidates their context-bound completions.

[The tab strip](../qml/TabBar.qml) follows the web
[tab bar](../../../web/src/components/workspace/WorkspaceTabBar.tsx) and
[tab item](../../../web/src/components/workspace/WorkspaceTabItem.tsx). It opens
blank documents, switches documents, shows unsaved markers and closes documents.
Dirty close offers Save, Discard and Cancel. A canceled chooser or failed save
leaves the tab open. Server saves must acknowledge the current draft before a
requested tab close can finish. Opening an already-open server workflow selects
its tab, including during its initial fetch. The Open file action also selects
already-open local paths.

Tabs follow the scoping of the web
[workspace tab store](../../../web/src/stores/WorkspaceTabsStore.ts). A tab
belongs to its server workflow's `project_id`. The Personal project, `default`
and documents without a project form one scope. A new or local document joins
the project on screen. The strip shows the active project's tabs, and tab
indices, shortcuts and close others count only those tabs. The project selector
before the tabs shows the project glyph, the project name and a menu. The menu
lists Personal, the account's projects from `projects.list` and any project with
an open document. Choosing a project returns to its last active document. An
unlisted project takes the active document's name, as on the web.

Dragging a tab draws a two-pixel accent line on the left or right half of the
tab under the pointer. Releasing over a tab moves the dragged tab to that side,
and releasing elsewhere changes nothing. A drag does not select the tab. Tabs of
other projects keep their places. Each reorder writes the open-document list
immediately, as the web store persists every change.

The tab menu has the web entries Rename, Close tab, Close other tabs and Close
all tabs, all enabled. Linked child tabs omit Rename. Close other tabs closes
the other tabs of the shown project. Close all tabs closes every project's tabs.
Both ask about every unsaved document before closing any. Cancel leaves all of
them open. A server Save in that question closes its own tab after the server
acknowledges it, and the remaining tabs stay open. Rename and a double-click on
the active tab edit the name in place. Enter commits and Escape keeps the name.
Server workflows save the name through workflow metadata. Local files rewrite
their file.

A running workflow shows a 14-pixel spinner before its title while any of its
runs is starting, queued or running, which the web maps to its `running` runner
state. Background tabs update when their own run events arrive. Instant update
hides the spinner, as on the web. Unsaved tabs show an eight-pixel warning dot
after the title.

Tabs are 120 to 220 logical pixels wide and elide long names. Overflowing tabs
scroll inside the strip, and the new-tab button stays after the visible tabs.
A name that is cut off shows its full text
150 milliseconds after the pointer enters it. Close buttons show "Close <name>".
Middle-click closes a tab. Shortcuts follow
[the web table](../../../web/src/config/shortcuts.ts): Ctrl+PageUp, Ctrl+Shift+[
and Ctrl+Alt+Left select the previous tab, Ctrl+PageDown, Ctrl+Shift+] and
Ctrl+Alt+Right select the next tab, and both wrap. Ctrl+1 to Ctrl+9 select a tab
by position. Ctrl+T opens a tab and Ctrl+W closes the active tab.

Accepted window closure stores open local paths, server workflow identities,
each tab's project and the active tab in QSettings. Startup restores those
references in their stored order, and restored tabs keep their project before
their documents load. Tokens and unsaved snapshots are not stored. Unnamed
local tabs restart blank. Server restoration uses the configured environment
token. Selection, viewport and undo history persist during tab switches, rather
than across process restarts.

[WorkflowTabsTest](../tests/ui/WorkflowTabsTest.cpp) drives actual tab buttons,
canvas drags and close-dialog buttons through EditorWindow. It checks separate
undo histories, cancel and local-save closure, background run output over
MsgPack WebSocket, destroyed-session completion isolation, a delayed upload
crossing tab closure, open-document restoration and duplicate server opens.
The large-graph case checks graph and item identity, selection, viewport,
document changes and model-reset signals while switching.

[WorkflowTabsDragTest](../tests/ui/WorkflowTabsDragTest.cpp) sends pointer and
key events to the strip, the menus and the canvas. It covers both drop sides and
their indicator, a drop on the dragged tab, a release outside every tab, order
restoration in a process that never closed its window and after closure, the
exact menu entries, close others with an unsaved tab under Cancel and Discard,
rename by menu and double-click, close tab and close all. It also covers
middle-click, every tab shortcut, title and close tooltips, tab width limits,
overflow scrolling, a background run badge cleared by a MsgPack `job_update`,
instant update, and project scoping against a local HTTP server with
restoration. Removing the persist call from `EditorWindow::dropTab` fails the
order test, because the restored window then has one tab instead of three. Set
`NODETOOL_TABS_CAPTURE_DIR` to capture dark and light editor images, the strip
during a drag, and the tab menu. Run:

```sh
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software ctest --test-dir <build> --output-on-failure -R '^node_editor_(workflow_tabs|workflow_tabs_drag|ui|canvas_authoring|autosave_host|server_sync_host|menus)$'
```

Dark and light captures at 1200 × 800 were opened at original resolution:
`tabs-strip-*` during a drag, `tabs-running-*` with a background run, and
`tabs-menu-*`. `WorkflowTabsTest` adds `tabs-dark` and `tabs-light` at
1440 × 900. They show the project glyph, name and caret, a 220-pixel tab with
an elided name and an unsaved dot, the accent line on the right half of the
drop target, the spinner before a running title, the active tab's editor
background and two-pixel underline, divided tabs with close buttons, and the
new-tab button after the last tab. The light strip uses the native chrome
color rather than the web's white app bar, so its active tab stands out less.
Native tab titles use the 500-weight label role, and web titles use the
regular weight.

Native differs from the web in these ways. Selecting a tab also scrolls it into
view. The web offers one discard
confirmation for a close, and native asks Save, Discard or Cancel for each
unsaved document. Native creates a blank workflow after the last tab closes,
and a project with no open documents opens a blank workflow, because native has
no project home. The project selector is one button, without the web's project
home, rename, search, New project and documents column. The new-tab button
creates a blank workflow instead of opening the web's create menu. Double-click
renames only the active tab, because each retained tab hosts its own strip. The
tab menu and project menu are Qt menus. The strip is 40 logical pixels tall,
and the web app bar is 36.
Child canvases and linked workflow navigation are described below.


## First-use and dependency setup

The guide waits for `workflows.list({ limit: 1 })` and appears only when the
saved list is empty. Disconnected editors and unresolved lists hide it. Account
changes invalidate pending responses. The guide offers the String Input → Output
starter, choosing nodes, and server workflow templates. Starter creation is an
explicit, atomic document edit. Starting or choosing nodes
keeps the guide visible with the five readiness items. Closing dismisses it for
the current document. Readiness follows
`web/src/components/node/reactFlowGraphModel.ts:firstWorkflowReadiness`: exact
starter node types, a directed edge between them, both nodes with a clean document,
and any completed run.
The optional packs entry follows the namespace list in the catalog. Its popover
also opens the runtimes and packs dialog for existing workflows.
Missing metadata remains visible on its card. Missing runtime warnings use the
server's runtime status response. Catalog refresh changes presentation metadata,
without rewriting stored nodes, edges, properties, positions or undo history.

`tests/ui/SetupHostTest.cpp`, registered as `node_editor_setup_host`, sends real
pointer events through EditorWindow and its nested tab hosts. Its local fake
server exercises starter and template actions, unknown metadata, runtime warnings,
pack progress, failure, retry, cancellation, account replacement and tab closure.
It checks unchanged graph JSON and undo history after metadata disappears and
returns. Capture output is enabled only by `NODETOOL_SETUP_CAPTURE_DIR`.
Dark and light captures at 1200 × 800 cover the unstarted guide and started
checklist. Each was opened at original resolution. The guide has a title, caption,
one row of actions, a primary starter, and outlined alternatives. It sits 24
logical pixels below the canvas top and centers in the canvas left by the docks.
The checklist shows success checks and disabled circles without clipping. Native
uses a fixed preferred panel width and a flat border rather than the web
surface's content sizing and elevation shadow. Template browsing remains a native
dialog rather than the web examples tab. F38 is not accepted.

Pack enabling calls `packs.setBuiltinEnabled` and reloads the node catalog on
success. `PackSetup` shares pack state and pending IDs across tabs in one window.
Only the active tab supplies node types. Disabled optional builtins enable when
used by that workflow or when `settings.secrets.list` reports their key configured.
The namespace and key mapping is a native port with source references in
`src/server/PackMapping.inc`. The route does not expose that mapping.
The category visibility catalog names its web source in `PackSetup.cpp`.

A rejection changes the error alone and does not retrigger synchronization.
New node types, changed secrets or an explicit refresh can retry, as with the web
hook's effect inputs. Credential changes discard pending responses. The native
key check uses `is_configured`, because the server includes unconfigured catalog
rows. The web hook currently checks row presence alone, unlike its stated intent.
Secret metadata refreshes every 30 seconds and when the optional packs panel opens.
Automatic pack operations never invoke a document command.

`tests/ui/PackSetupHostTest.cpp` is registered as `node_editor_pack_setup_host`.
It uses a local fake server with builtin and secret response shapes from the
server routers. Capture output uses `NODETOOL_PACK_SETUP_CAPTURE_DIR`.
The focused host checks key and workflow enabling, already enabled and required
packs, inactive tabs, shared pending requests, rejection without a retry loop,
stale account responses, unchanged graph and undo state, and catalog refresh.
Removing workflow pack discovery made its test fail with zero mutations instead
of one. Removing the pending guard made the two-tab test fail with two mutations
instead of one. Both mutations were restored before the passing focused run.

The dark and light `disabled`, `enabling` and `enabled` PNGs were opened at
original 1200 × 800 resolution. The scrolled panel shows provider credentials,
local pack state, refresh and runtimes access. The local toggle is off, disabled
while enabling, then on. The trigger sits below the namespace list, separated
from the panel edges. The popup uses the web's 340 logical pixel width and a
70% height limit, with native typography, flat borders and native controls.
The trigger lacks the web inventory icon and separate accent-colored count.
“Add API key” opens the connected server's provider settings in the browser,
rather than an embedded workspace tab. Native adds refresh and runtime actions.
F38 remains unaccepted.

Runtime installation uses the local CLI, following
[the runtime install design](../../../docs/runtime-install-design.md#51-hosts).
`NODETOOL_CLI` selects an executable first, then the editor searches `PATH` for
`nodetool`. Server-provided paths never select a process. `runtime list --json`
supplies the package catalog. Its `packages` rows contain `id`, `name`,
`installed`, `version` and `description`, as implemented in
[`runtime.ts`](../../../packages/cli-admin/src/commands/runtime.ts).
Native derives the status label and `nodetool runtime add <id>` display command.
Without a usable CLI, `packs.runtimeStatuses` supplies installed flags.
Remote server flags remain authoritative even when a local CLI is available.

Only HTTP(S) loopback origins permit local installation. Explicit install actions
launch `runtime add` with separate arguments, checking each id against both the
CLI list and `^[a-z][a-z0-9-]*$`. Tabs share one installation slot per window.
Workflow checks run once per nonempty workflow id after metadata and statuses
arrive, deduplicate missing `required_runtimes`, and offer sequential Install all.
Node errors forward `error_detail.missing_runtime` to the same dialog.
Remote connections show copyable commands without starting a local install.
Structured `managed`, `bringYourOwn` and `restart` strings appear verbatim.
Without structured host details, the dialog gives the CLI command to run on the
server machine. The status route does not expose the remote host identity.

Progress retains CLI output, including restart instructions and exit statuses.
Failures retain the last output lines and offer Retry. Cancel terminates the
process and kills it after a timeout. On Unix, a new process session also lets
cancellation and destruction stop descendants. Account changes and tab closure
stop owned processes. The cancellation message warns about partial installation.
Success refreshes runtime statuses and the node catalog without document commands.
No server installation route was added.

`tests/ui/RuntimeInstallTest.cpp`, registered as `node_editor_runtime_install`,
uses a CMake-built fake CLI and a local HTTP fixture. It covers list parsing,
server fallback, sequential installation, failure and Retry, cancellation of a
termination-resistant process, restart output, remote commands, structured error
details, invalid ids, workflow offers, shared-window exclusion, account changes
and closure through the editor's runtime dialog. Removing id validation made the
invalid-id test enter installation. Disabling process termination left the
cancel fixture alive. Both mutations were restored.

Captures use only `NODETOOL_RUNTIME_INSTALL_CAPTURE_DIR`. Dark and light
`installing`, `failed` and `remote` PNGs were opened at original resolution.
They show progress output, the exit-code failure with Retry, and selectable
remote instructions with Copy command. Compared with the web
`RuntimeInstallDialog.tsx`, native combines runtime and pack management, uses
text status labels instead of colored chips, retains explicit cancellation during
installation, and does not auto-close on success. Native uses flat borders and
native typography. F38 remains unaccepted.

Template browsing uses `workflows.examples` inside the native dialog. Its list
contains empty graph placeholders. Selection calls `workflows.create` with the
example seed reference and package, then opens the created server workflow.
External pack download/installation is not provided by the referenced server
router. The tested pack operation enables a builtin already shipped on the server.


### F24 run queue

`AccountJobs` shares the authenticated `jobs.list({limit: 20})` query across tabs.
It retains server ordering and merges local run events by job ID. Rows expose
`name`, `status`, `started_at`, `workflow_id` and `jobId`. Missing job names use
the workflow name. Account replacement disconnects the old cache subscription.
Closing the last tab destroys its cache and pending callbacks. Like
`useRunningJobs`, there is no polling interval. Mounts reuse results for ten
seconds, and submission, lifecycle events, reconnects and cancellation refresh
the query. A window with N tabs makes one initial list request per account,
with no per-tab polling. Invalidation during an in-flight fetch schedules one
shared follow-up fetch.

Stop and Remove call `jobs.cancel`, including jobs submitted by another client.
Failures reach the editor error surface and clear the stopping state. Run labels
and tooltips include queue position and pending count. Ctrl/Cmd+Enter runs the
workflow, and Escape stops active work before clearing canvas gestures.

The queue starts collapsed with a status dot, one run name or a running count,
an elapsed clock, an expand control and queued count. Expanded content groups
Running, Enqueued and Cancelled cards. Completed and failed jobs stay in output
history rather than the overlay. Cancelled jobs alone do not keep it visible.
Running cards select the output lens only for the current workflow, using pointer,
Enter or Space activation. The selected card shows On canvas. Pinned canvas
focus remains different from the web store.

The overlay is 304 logical pixels wide at the canvas leading margin, beyond the
native rail and catalog. Its maximum height is the window height minus 112 logical pixels. Like the web
overlay, it floats above the output dock. Narrow
canvases constrain its width to keep controls inside the viewport. Enter and exit
use the primitive normal motion duration with retained exit content. Reduced
motion removes transitions and progress animation. Elapsed clocks use server
`started_at` when available, otherwise the locally observed running time. The
one-second timer stops when no live job runs.

`QueueUiTest.cpp` uses pointer and keyboard events against QML and deterministic
MsgPack events through EditorWindow. `NODETOOL_QUEUE_CAPTURE_DIR` enables dark
and light captures at wide and narrow sizes, in both expansion states. F24 remains
partial pending visual acceptance and pinned canvas focus parity. The expanded
header centers counts with the title. Shared Surface shadows are disabled on the
software renderer because the unblurred offset rectangle is clipped into dark
corner wedges by overlay hosts. QueueUiTest checks transparent bottom corners
in both themes and header center alignment.

More includes Instant Update. Numeric commits immediately run the changed node
and its downstream targets when connected and idle. Other commits debounce for
300 milliseconds. Drafts remain local. This follows the server auto-run path in
`web/src/hooks/nodes/useInputNodeAutoRun.ts`. Both clients freeze canvas execution animation while Instant Update is enabled.
The web also provides unconditional in-browser image-slider previews through
`useLiveSliderWriter.ts`. Native has no browser kernel preview host. This gap
is user-approved scope change SC1 in the
[parity inventory](parity-inventory.md#user-approved-scope-changes).

`QueueDataTest.cpp`, registered as `node_editor_queue_data`, uses real jobs-router
response envelopes from a local HTTP and MsgPack server. It covers account-wide
rows, deduplication, status fields, shared requests, account and closed-session
isolation, cancellation success and rejection, toolbar text, shortcuts and
Instant Update execution. F24 remains partial.

### F27 reconnect and live-running states

The web contracts are `resumeInFlightJobs`, `handleJobResumed`, `settleLostRun`
and `isJobHalted` in `web/src/stores/workflowUpdates.ts`. The socket policy is
`WebSocketManager.ts` in `web/src/lib/websocket/`, configured by
`GlobalWebSocketManager.ts`. F27 is implemented with acceptance pending.

| Behavior | Web | Native | Test |
| --- | --- | --- | --- |
| Automatic reconnect | Any close that the client did not ask for schedules a retry. The wait is 1000 ms times 1.5 per failed attempt, capped at 30 s and scaled by a random 0.5 to 1.0. The attempt limit is unlimited. A successful open resets the count. Closes with code 1008, 1009, 1010, 4000, 4001 or 4003 end the retries (`getReconnectDelay`, `shouldReconnect`). | Same schedule in `ReconnectPolicy.h`, applied by `WorkflowSession`. A connect that never opens retries too. The same close codes end the retries, and an optional attempt limit is available to callers. A deliberate disconnect, a server change and teardown cancel any pending retry. | `RunReconnectTest::droppedSocketReconnectsByItself`, `RunReconnectTest::policyFollowsTheWebLadder`, `RunReconnectTest::backoffGrowsAndSuccessResetsIt`, `RunReconnectTest::terminalCloseCodeStopsTheRetries`, `RunReconnectTest::givesUpAfterTheAttemptLimitAndManualReconnectRecovers`, `RunReconnectTest::deliberateDisconnectDoesNotReconnect`, `RunReconnectTest::serverChangeCancelsThePendingRetry`, `RunReconnectTest::teardownDuringBackoffOpensNothing` |
| Manual retry | `retryNow` cancels the pending wait, sets the attempt count to 1 and connects at once. | More → Reconnect and the status bar Reconnect button do the same. A session that gave up starts again from zero. | `RunReconnectTest::manualReconnectResetsTheBackoff` |
| Connection status | The status bar reads Connected, Connecting (during an attempt), Offline (between attempts) or Idle (nothing started). The chat store words a retry "Reconnecting... (attempt N)". | The status bar shows the same four states. A caption beside them reads "Reconnecting… (attempt N)" during retries and "Connection failed" after the session gave up. A failed retry reports no session error, so panels that show the last error, such as Versions, keep their text. Giving up reports one. | `RunReconnectTest::statusNamesTheAttempt`, `RunReconnectTest::windowShowsTheReconnectState`, `RunReconnectTest::failedRetriesReportOneErrorWhenTheSessionGivesUp` |
| Run resumes after a retry | `resumeInFlightJobs` runs on every open. | The automatic open runs the same `reconnectRuns` path, so in-flight runs resume by job ID and last sequence. | `RunReconnectTest::inFlightRunResumesAfterAutomaticReconnect` |
| Disconnect mid-run | The server keeps the run while the socket is down, and the socket reconnects with backoff. | Runs become uncertain and new runs are refused until the server answers. The running ring holds still and the card reads Disconnected. | `RunReconnectTest::reconnectedRunTakesItsReplayedOutcome`, `RuntimeUiTest::projectionPreservesEditingAndItems` |
| Reconcile without resubmitting | Each run still queued or running sends `reconnect_job` with its job ID and last `job_seq`. Nothing is submitted again. | Same. Finished runs are not resumed. | `RunReconnectTest::reconnectResumesOnlyActiveRunsWithoutResubmitting` |
| Finished during the gap | A `job_resumed` "finished" reply with frames to replay waits for the replayed `job_update`. With nothing to replay, the reply settles the run. | Same in the session and the canvas projection. | `RunReconnectTest::reconnectedRunTakesItsReplayedOutcome`, `RunReconnectTest::runFinishedDuringTheGapSettlesTheCanvas`, `NodeRuntimeModelTests::resumedFinishedRunWaitsForItsReplayedOutcome` |
| Lost run | A `job_resumed` "unknown" reply marks the run as an error, drops its node statuses, progress and edge reports, and warns "Lost track of this run after reconnecting". | Same. The run settles as failed, the canvas stops animating, and later runs are allowed. | `RunReconnectTest::lostRunSettlesAndAllowsNewRuns`, `RunReconnectTest::lostRunStopsTheCanvasAnimation`, `NodeRuntimeModelTests::lostRunClearsItsRunningState` |
| Late and foreign frames | Late node, progress and edge frames of a cancelled run are dropped. Frames for an untracked job are ignored. | Same. A late lifecycle frame never reopens a finished run. Artifacts that follow completion still arrive. | `RunReconnectTest::lateAndForeignFramesAreIgnored`, `NodeRuntimeModelTests::cancelledRunDropsLateNodeFrames` |
| Server change | Stores are keyed by workflow and job, and a new connection starts with no runs. | The session, output panel and canvas projection forget the previous server's runs. No running state returns when the new connection opens. | `RunReconnectTest::serverChangeDropsTheOldRun`, `NodeRuntimeModelTests::selectingNoRunClearsTheProjection` |
| Running animation | Animations follow running nodes and edges that carry messages. Reduced motion stops the flowing-edge animation (`handle_edge_tooltip.css`). | The animation timer runs only while a node is running or a wire flows, the socket is connected, and reduced motion is off. | `RuntimeUiTest::projectionPreservesEditingAndItems`, `RuntimeUiTest::wiresFlowFromRunningSourcesOnly` |

Differences: the native session has no connection timeout for an attempt that
hangs, no liveness ping that detects a half-open socket, and no retry on network
or window focus events. A lost run keeps the local status failed even when the
server row later reports another outcome.
Run the suite with `ctest --test-dir <build> -R '^node_editor_run_reconnect$'
--output-on-failure`.


## F09 child graphs and derived ports

Subgraph cards use the shared violet role, editable derived inputs and an
Open subgraph footer with inner-node counts. The footer opens the child by
pointer and keeps its count clear of the resize handle. Graph storage is hidden
from property fields without changing the document. Running cards show progress
above the footer. Add output opens the native dynamic-port form.

[GroupIntoSubgraph](../src/document/GroupIntoSubgraph.cpp) follows
`useGroupIntoSubgraph.ts` lines 79–161 for internal and boundary edges, port
deduplication, `inN`/`outN` names and boundary-node positions. Lines 190–208 define
selection expansion, metadata requirements and centroid placement. Native node
creation supplies the standard width, and one graph replacement provides the
single undo entry from lines 237–245. Existing node, edge and graph extension
fields survive. The web offers no inverse subgraph operation or dedicated
shortcut in these call sites.

[SubgraphCardTest](../tests/ui/SubgraphCardTest.cpp), registered as
`node_editor_subgraph_card`, covers footer counts and opening, hidden graph
storage, inline input editing, output creation, boundary grouping and exact JSON
undo/redo through pointer and keyboard events. Removing the graph filter and
boundary rewrite makes those regression tests fail. Set
`NODETOOL_SUBGRAPH_CARD_CAPTURE_DIR` to capture dark and light cards with their
inspectors. F09 remains partial pending visual acceptance. The native output
form opens in a popup rather than expanding inside the card. Running progress
has no web elapsed-time estimate.

[ChildPorts](../src/document/ChildPorts.cpp) reads inline subgraphs and stored
workflow/app snapshots. It uses the web input/output type mappings, metadata
input types, named custom inputs, nested ReactFlow properties, title fallbacks,
app constants, variable defaults and streamed output correlation. Projection
keeps unknown incident handles without rewriting imported JSON.

[EditorTabs](../src/ui/EditorTabs.cpp) opens child canvases from the selection
bar, double-click, More or the command menu. Inline subgraphs appear in a
per-workflow strip below the workflow tabs. Each strip starts with a host tab
that cannot close. Nested strips keep the ancestor child tab marked. The
subgraph accent role follows the web violet. Each surface retains its own
EditorWindow, QML engine, document and undo stack. The owner keeps a surface
registry, while the workflow list and persisted state exclude inline children.

Inline edits write back after 300 ms of inactivity and flush through ancestors
before switching, closing or saving, following
[SubgraphTabContent](../../../web/src/components/workspace/SubgraphTabContent.tsx).
Returning after parent undo reloads the stored child graph, resets stale child
history and closes its descendants. Replacing a workflow closes its child
surfaces. Closing a child closes its descendants. Reopening reads the parent
graph. Canvas shortcuts, inspector data and run controls use the shown surface.
Inline Save uses the parent document. Unknown child graph fields and nested
snapshots survive copy and local save/reopen.

A child graph update and its derived ports form a parent undo entry. Subgraph
and Workflow edges on removed dynamic ports are removed in that entry, following
SubgraphSync and replaceDynamicSlots. Undo restores those edges. Edges on
unchanged names retain their complete JSON. AppLoader uses updateNodeData in
the web, so app edges remain and the projection exposes fallback incident ports.
Missing workflow snapshots show a status error. Server load errors leave the
parent unchanged. Credential epochs and destroyed sessions reject stale child
responses. Linked workflows is available from More and the command menu.

[SubgraphTest](../tests/ui/SubgraphTest.cpp), registered as
`node_editor_subgraph`, drives actual EditorWindow pointer controls and text
entry with a deterministic HTTP/WebSocket fixture. It covers child editing and
return, retained edges, independent undo scope, parent reconciliation, nested
copy, unknown-field round trips, app binding/stream derivation, missing children
and delayed responses after tab closure or account replacement. Pointer tests
cover host activation, nested marks, cascade closure, reopening, workflow
closure and child Save. Restore tests exclude child canvases and retain the
owning workflow selection. Replacement rejects pending child writeback. Set
`NODETOOL_SUBGRAPH_CAPTURE_DIR` for dark and light captures with one and two
levels of child strips. The strips occupy the native canvas column beside the
catalog and inspector docks. The root host reads Workflow and nested hosts use
the child label. Rows use the dock tab height, panel fill for active tabs, a
top marker, bottom divider and separate close-button hover. Geometry and rendered
label assertions cover the canvas extent and both host depths. Run with:

```sh
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software ctest --test-dir <build> --output-on-failure -R '^node_editor_(subgraph|workflow_tabs|ui|menus)$'
```

F09 remains partial. App and workflow choice currently
uses the existing node properties and saved snapshots rather than the web's
specialized selection controls. The linked-workflows menu lists workflow/app
nodes in the current graph rather than a mini app document's operation bindings.


## F36 chat embedding evidence

F36 is partial and not accepted. `EditorChat.qml` embeds `NodeTool.Chat` in
its host theme with one 44-pixel header, thread title, tooltips, thread toggle,
new conversation and close. It uses the web English empty-state strings
without suggestions. Header drag, left/bottom/corner resize and viewport
clamping use global position, size and collapsed preferences. Geometry is
saved on release. Thread-list visibility stays transient, matching
[CanvasChatDockStore](../../../web/src/stores/CanvasChatDockStore.ts).

`ChatSession` filters by server `workflow_id` with a client binding fallback.
Creation binds the current workflow. The list searches titles and previews,
sorts by update time, confirms deletion and reports failure. Per-editor
sessions preserve drafts and background turns across tab switches. Closing a
tab retains its hidden host until unfinished turns settle. Account replacement
clears retained hosts and protected chat state.
[ChatSurface](../../../web/src/components/workspace/ChatSurface.tsx) lines
112–119 keeps the shared connection on unmount.
[WorkspaceTabsStore](../../../web/src/stores/WorkspaceTabsStore.ts) `closeTab`
removes tab state without stopping chat. Native therefore retains the turn
after closing its editor tab.

The expand control is hidden because native has no chat workspace-tab type.
The web [expand handler](../../../web/src/components/panels/CanvasChatWindow.tsx)
opens a chat tab and navigates to the workspace. Native keeps its floating
conversation as the available destination.

The run-output Ask agent action creates a conversation with the web draft
“Help me diagnose the selected run.” and `ui_context.run.run_id`, following
[AskRunAgentButton](../../../web/src/components/runs/AskRunAgentButton.tsx).
Native has no span inspector or workflow-generation landing checklist. The
web [landing repair callback](../../../web/src/components/workspace/WorkflowEditorSurface.tsx)
sends the failure message immediately. Native has no matching landing surface.
Explicit Retry resubmits the failed prompt and attachments after a click.

The chat envelope follows
[CanvasMediaComposer](../../../web/src/components/panels/CanvasMediaComposer.tsx)
lines 58–105 and [GlobalChatStore](../../../web/src/stores/GlobalChatStore.ts)
`trySendMessage` lines 1042–1228. It includes `name`, typed content,
provider/model, thread/project, permission mode, `media_generation`,
`reasoning_effort` when set, ambient `workflow_id` and `ui_context`. It omits
wire-level `created_at` and `workflow_target`. A media turn runs on the mode's
model and carries no reasoning level. A text part is sent only for a non-blank
prompt, as `MediaChatComposer.tsx` lines 735–740 do. Attachments are projected
from the server's asset record through `assetToDroppedFile` and
`makeMessageContent`, so the URI carries the web extension and a type the web
cannot classify becomes a text part with the file name.

The native composer in `native/chat/qml/ChatComposer.qml` offers the
[MEDIA_MODES](../../../web/src/components/chat/composer/mediaModes.tsx) menu,
with the two "Soon" modes disabled. Each mode shows its model chip and the
setting chips of [ModeChips](../../../web/src/components/chat/composer/ModeChips.tsx)
in web order with the defaults of
[MediaGenerationStore](../../../web/src/stores/MediaGenerationStore.ts).
Options narrow to the picked model's durations, resolutions, aspect ratios and
voices, and a pick snaps unsupported values as `clampToAllowed` does. A media
send without a model is refused with the web "Pick the … model to generate
with." sentence and opens the mode's picker. `native/chat/src/runtime/ComposerRules.cpp`
ports `buildMediaGenerationRequest`, `resolveImageSize`, `supportsReasoningEffort`,
`assetToUri`, `findMentionTrigger`, `removeMentionToken` and `groupByDate`.
The reasoning chip follows
[ReasoningSelector](../../../web/src/components/chat/composer/ReasoningSelector.tsx)
and renders only for a model that accepts a level. Typing `@` opens the asset
picker of [useTextareaAssetMention](../../../web/src/components/chat/composer/useTextareaAssetMention.tsx)
with Recent and Saved buckets. Saved runs a debounced `assets.search` with the
web page size and drops folders. Arrow keys, Enter, Tab and Escape behave as on
web. A picked asset is attached and the `@query` is cut from the prompt.

`native/node-editor/scripts/generate-chat-web-fixtures.mjs` bundles and runs
the web code under Node. It drives `trySendMessage` with a capturing
WebSocket manager, `buildMediaGenerationRequest`, `buildUiContext` and
`assetToDroppedFile`, and writes `tests/ui/ChatPayloadFixture.json`. Two steps
are transcribed with line citations because they live inside React hooks:
the `CanvasMediaComposer` send handler and `makeMessageContent`. `--check` fails
when a checked-in fixture differs from the web output. A modified manifest
name failed the check, and the inverse edit restored it.

`EditorChatTools.cpp` owns the host-tool manifest and dispatch. Graph mutations
use `WorkflowDocument::applyCommand`. Dynamic slot declaration and connection
creation share one batch, so rejection leaves no slot and success has one undo
entry. `patchChatData` merges properties and maps UI and port fields while
retaining arbitrary data overlays and unknown stored fields. Code nodes use
the native Acorn port inference. Model search reuses the public native language-model
enumeration when ready and calls `models.availableForKind` for task-scoped lookup,
without changing model-picker files. The graph result includes the web envelope,
validation and a document revision.

`ui_search_nodes` ranks through `src/ui/EditorChatSearch.cpp`, a port of
[nodeSearch.ts](../../../web/src/utils/nodeSearch.ts) `computeSearchResults`
with its prefix tree, BM25 index, fuzzy and typo scorer, `rankNodeMetadata`,
quick-action boosts, type filters and `localeCompare` tie-breaks. The tool then
applies the namespace preference, limit and envelope of
[searchNodes.ts](../../../web/src/lib/tools/builtin/searchNodes.ts) lines 74–150.
`tests/ui/ChatSearchFixture.json` holds the web tool's own results for 47
queries: the query sets of `nodeSearch.test.ts`, `nodeSearch.rankSearchNodes.test.ts`,
`searchNodes.test.ts` and `searchNodesTool.test.ts`, their generated catalogs
of 500 to 2,000 nodes, and a catalog with tags, use cases, deprecated, hidden,
provider and default-namespace nodes.

The advertised manifest is `resources/chat/tool-manifest.json`, the output of
`FrontendToolRegistry.getManifest()` for the 16 implemented tools. Descriptions
and JSON schemas therefore equal the web's, including the
`^graph:[a-f0-9]{64}$` pattern on `based_on_revision`.

The document revision no longer hashes the graph. The web hashes graph content
in `packages/protocol/src/workflow-document-revision.ts`. Native hashes a random
identity of the loaded document and a count of its `changed()` notifications,
which every graph change emits. A revision therefore still changes with every
edit and keeps the web `graph:` digest form. One difference remains: an edit
followed by its undo gives a new revision, where the web returns the earlier
hash, so a stale-read check can refuse an edit the web would accept.
F36 remains partial and is not accepted.

### Canvas tool inventory (R1)

The web advertises the complete registered manifest in
`web/src/stores/GlobalChatStore.ts` lines 878–888. Registration comes from
`web/src/lib/tools/builtin/index.ts`. Focus only makes `ui_workflow_*` names
resident, through `focusedUiToolNames` in
`packages/websocket/src/session/chat-prompt.ts` lines 356–365. It does not
filter the manifest. Other-document tools below remain registered in the web
app but do not act on a workflow canvas.

`getGraph.ts` lines 237–253 project editor nodes and edge types. Lines 280–295
add `ok`, `workflow_id`, `source`, `document_revision` and `validation`.
`WorkflowDocument` JSON is adapted to that envelope and the ReactFlow data
projection. The revision normalization follows
`packages/protocol/src/workflow-document-revision.ts` lines 70–149.
`workflow.ts` lines 11–16 route explicit workflow IDs without changing tabs.
The native bridge uses the same routing for open documents and rejects unknown
or ambiguous IDs. Credential changes cancel pending model searches. The chat
session disconnect clears protected calls before another account connects.

There is no registered graph-selection, graph-fit or graph-zoom tool in the
web canvas inventory. Selection context remains in `ui_context.selection`.
`ui_switch_tab`, `ui_open_workflow`, workflow `ui_open_document`, `ui_copy`
and `ui_paste` have native host handlers. Other document kinds in
`ui_open_document` return an error.

| Web tool | Outcome | Native scope or blocker |
| --- | --- | --- |
| `ui_add_node` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_audio_apply_effect` | Not applicable | Requires the audio document editor handler, outside the native workflow-canvas host. |
| `ui_audio_edit` | Not applicable | Requires the audio document editor handler, outside the native workflow-canvas host. |
| `ui_audio_get_state` | Not applicable | Requires the audio document editor handler, outside the native workflow-canvas host. |
| `ui_audio_list_effects` | Not applicable | Requires the audio document editor handler, outside the native workflow-canvas host. |
| `ui_audio_save` | Not applicable | Requires the audio document editor handler, outside the native workflow-canvas host. |
| `ui_code_get_state` | Not applicable | Edits the unapplied draft of an open web Code-assistant dialog. Native edits the node directly and has no such draft dialog. |
| `ui_code_set_code` | Not applicable | Edits the unapplied draft of an open web Code-assistant dialog. Native edits the node directly and has no such draft dialog. |
| `ui_code_set_ports` | Not applicable | Edits the unapplied draft of an open web Code-assistant dialog. Native edits the node directly and has no such draft dialog. |
| `ui_connect_nodes` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_delete_edge` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_delete_node` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_editor_get_content` | Not applicable | Requires an active text-editor adapter. The canvas does not mount one, and `builtin/index.ts` does not import this module. |
| `ui_editor_get_selection` | Not applicable | Requires an active text-editor adapter. The canvas does not mount one, and `builtin/index.ts` does not import this module. |
| `ui_editor_insert` | Not applicable | Requires an active text-editor adapter. The canvas does not mount one, and `builtin/index.ts` does not import this module. |
| `ui_editor_replace_all` | Not applicable | Requires an active text-editor adapter. The canvas does not mount one, and `builtin/index.ts` does not import this module. |
| `ui_editor_replace_selection` | Not applicable | Requires an active text-editor adapter. The canvas does not mount one, and `builtin/index.ts` does not import this module. |
| `ui_entity_apply` | Not applicable | Production ingredients library and prompt injection, outside the native workflow-canvas host. |
| `ui_entity_list` | Not applicable | Production ingredients library and prompt injection, outside the native workflow-canvas host. |
| `ui_get_graph` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_jsscript_get_state` | Not applicable | Requires the jsscript document editor handler, outside the native workflow-canvas host. |
| `ui_jsscript_run` | Not applicable | Requires the jsscript document editor handler, outside the native workflow-canvas host. |
| `ui_jsscript_set_code` | Not applicable | Requires the jsscript document editor handler, outside the native workflow-canvas host. |
| `ui_jsscript_set_meta` | Not applicable | Requires the jsscript document editor handler, outside the native workflow-canvas host. |
| `ui_jsscript_set_ports` | Not applicable | Requires the jsscript document editor handler, outside the native workflow-canvas host. |
| `ui_jsscript_set_tests` | Not applicable | Requires the jsscript document editor handler, outside the native workflow-canvas host. |
| `ui_jsscript_test` | Not applicable | Requires the jsscript document editor handler, outside the native workflow-canvas host. |
| `ui_3d_add_object` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_capture_view` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_delete_object` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_duplicate_object` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_frame_scene` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_get_object` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_list_scene` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_redo` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_rename_object` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_select_object` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_set_geometry` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_set_light` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_set_material` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_set_material_color` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_set_parent` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_set_transform` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_set_visibility` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_3d_undo` | Not applicable | Requires the model3d document editor handler, outside the native workflow-canvas host. |
| `ui_move_node` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_open_document` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_app_add_component` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_add_operation` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_add_resource` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_debug` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_declare_variable` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_get_binding_targets` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_get_snapshot` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_list_component_types` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_list_operations` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_list_resources` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_list_variables` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_remove_component` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_remove_operation` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_remove_resource` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_remove_variable` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_select_component` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_set_title` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_update_component` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_update_operation` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_app_update_variable` | Not applicable | Requires the puck document editor handler, outside the native workflow-canvas host. |
| `ui_script_add_line` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_script_add_speaker` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_script_derive_storyboard` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_script_export_subtitles` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_script_get_state` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_script_send_to_timeline` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_script_set_line_text` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_script_set_setup` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_script_set_speaker` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_script_set_speaker_voice` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_script_voice_all` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_script_voice_line` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_script_write` | Not applicable | Requires the script document editor handler, outside the native workflow-canvas host. |
| `ui_search_models` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_search_nodes` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_set_node_title` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_sketch_add_layer` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_adjust_layer` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_crop` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_draw_shape` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_duplicate_layer` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_fill` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_flatten_visible` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_generate` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_get_layer_image` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_get_state` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_gradient` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_merge_down` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_pick_color` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_place_image` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_refine_brief` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_remove_layer` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_render_to_asset` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_reorder_layer` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_resize_canvas` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_select_layer` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_selection` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_set_color` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_set_layer_props` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_set_selection_shape` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_set_setup` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_set_tool` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_stroke` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_sketch_transform` | Not applicable | Requires the sketch document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_add_keyframe_version` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_add_shot` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_assemble_timeline` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_create_scene` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_delete_version` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_direct` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_duplicate_shot` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_extract_script` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_generate_clip` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_generate_keyframe` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_get_state` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_merge_scene` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_move_shot` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_relink_script` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_remove_shot` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_reproject_shots` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_revise_shot` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_select_shot` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_select_version` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_set_duration_source` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_set_entities` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_set_screenplay` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_set_setup` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_set_style` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_update_scene` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_storyboard_update_shot` | Not applicable | Requires the storyboard document editor handler, outside the native workflow-canvas host. |
| `ui_svg_get_state` | Not applicable | Requires the svg document editor handler, outside the native workflow-canvas host. |
| `ui_svg_replace` | Not applicable | Requires the svg document editor handler, outside the native workflow-canvas host. |
| `ui_svg_save` | Not applicable | Requires the svg document editor handler, outside the native workflow-canvas host. |
| `ui_svg_set_markup` | Not applicable | Requires the svg document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_add_group` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_add_marker` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_add_media_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_add_midi_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_add_model3d_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_add_reframe_keyframe` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_add_shape_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_add_text_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_add_track` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_animate_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_apply_take` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_bake_model3d_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_clear_animations` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_clear_reframe` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_delete_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_delete_marker` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_delete_track` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_duplicate_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_edit` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_generate_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_generate_from_beats` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_generatively_edit_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_get_clip_frames` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_get_state` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_list_animation_presets` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_list_instruments` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_move_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_move_track` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_plan_beats` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_quantize_notes` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_remove_beat` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_retarget_format` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_scale_velocity` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_seek` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_select_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_clip_binding` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_clip_params` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_effects` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_markers_from_beats` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_mask` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_matte` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_model3d_style` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_notes` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_parent` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_reframe_subject` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_setup` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_tempo` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_time_remap` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_track_instrument` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_set_transition` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_snap_to_beats` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_split_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_stagger_animations` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_transpose_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_trim_clip` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_timeline_update_beat` | Not applicable | Requires the timeline document editor handler, outside the native workflow-canvas host. |
| `ui_copy` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_open_workflow` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_paste` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_run_workflow` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_switch_tab` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_update_node_data` | Implemented | Native graph, catalog or host adapter in `EditorChatTools.cpp`. |
| `ui_workflow_build_from_plan` | Not applicable | Controls the web guided workflow-creation flow and its persisted `settings.setup` plan. The native canvas hosts graph editing and a pack-setup guide, without that creation flow. These tools are not advertised by the native host. |
| `ui_workflow_plan` | Not applicable | Controls the web guided workflow-creation flow and its persisted `settings.setup` plan. The native canvas hosts graph editing and a pack-setup guide, without that creation flow. These tools are not advertised by the native host. |
| `ui_workflow_set_setup` | Not applicable | Controls the web guided workflow-creation flow and its persisted `settings.setup` plan. The native canvas hosts graph editing and a pack-setup guide, without that creation flow. These tools are not advertised by the native host. |
| `ui_workflow_update_plan_step` | Not applicable | Controls the web guided workflow-creation flow and its persisted `settings.setup` plan. The native canvas hosts graph editing and a pack-setup guide, without that creation flow. These tools are not advertised by the native host. |

`tests/ui/EditorChatToolsTest.cpp` is registered as `node_editor_chat_tools`.
It drives the production `ChatSession::applyEvent` entry with tool-call envelopes
and checks WebSocket tool results. Cases cover implemented tools, command undo,
unknown-field preservation, rejected connections, Code ports and syntax checks,
a shared-protocol revision fixture, malformed fields and argument envelopes,
read-only documents, resource prefixes, stale tab targets and account replacement.
`ChatSession` rejects non-object arguments before their shape is lost in the
host's `QVariantMap` conversion.

The focused build passed. The final CTest run passed in 78.69 seconds with no
failed Qt Test cases. Both native design checks passed. Temporarily submitting
the connection batch as separate commands failed the undo test with two entries
instead of one. The same mutation failed the rejection test because an orphan
dynamic input remained after a refused self-connection. The mutation was restored
before the passing run.

`revisionCost` in `tests/ui/EditorChatToolsTest.cpp` loads graphs of 250, 500,
1,000 and 2,000 nodes and times synchronous `ui_move_node` dispatch, including
the edit and its result revision. Canvas projection runs later in the event loop
and is not timed. With the graph-wide hash, one call took 7.27, 14.26, 29.14
and 57.05 ms at those sizes. With the counter revision on the same quiet machine
it took 0.64, 1.06, 0.97 and 1.40 ms. Under load from other builds, the best of
three batches measured 1.49, 1.51, 1.41 and 2.63 ms. The test fails when the
2,000-node cost exceeds three times the 250-node cost, and the hash version
failed it. The remaining growth comes from snapshot materialization and the
edit itself. Full-editor performance with projection is not measured here.

`tests/ui/EditorChatTest.cpp` is registered as `node_editor_chat`. Pointer/key
and real text-mode WebSocket/tRPC tests cover geometry persistence, resize,
clamping, workflow filtering and creation binding, search, delete failure,
background streams after switching and closing tabs, retry, run-output Ask
agent, drafts, uploads, stop, tool undo and account replacement/disconnect.
`payloadsMatchWebSendPath` drives the 15 fixture cases through mode, setting
and reasoning menus with clicks and the prompt with key events, then compares
each received `chat_message` with the web data apart from its random id. The
fake server serves `models.providers` and the `*ByProvider` catalogs, so model
picks go through the catalog. `mediaModeRequiresModel`, `assetMentionPicker`
and `threadDateHeadingsAndDelete` cover the refusal, the picker keys and the
headings and exit animation. `native/chat/tests/ChatModelTests.cpp` runs the
web cases for reasoning support, mention parsing, date groups and image sizes.

Removing the creation request's workflow binding fails
`bindingFilteringAndRetry`. Removing position clamps fails
`geometryAndPersistence`. Dropping `media_generation` and `reasoning_effort`
from the send failed the payload test at `chat-reasoning`. Sending a null
`media_generation` in media modes failed it at `image`. Restoring the previous
substring matcher failed the ranking test at `web-rank` "image". Changing the
BM25 boost scale from 1.5 to 1.0 failed it at `catalog` "text to image". Each
mutation was restored with an inverse edit before the passing run. CTest passed
`node_editor_chat` with 15 Qt Test results, `node_editor_chat_tools` with 14,
`node_editor_large_graph` with 4 and the six native chat tests, all with
`--timeout 300`. Both native design and dependency checks exited successfully.

Captures use `NODETOOL_EDITOR_CHAT_CAPTURE_DIR` only. Dark and light 1280×800
closed, open-empty, thread-list, reasoning-menu, mention-picker, mode-menu,
media-chips, open-streaming and tool-edit-applied images are in
`/tmp/nodetool-editor-chat-captures`. The thread-list, media-chips,
mention-picker and mode-menu captures in both themes and the light
reasoning-menu capture were opened at original resolution. They show
upper-case group labels with right-aligned dates, the mode menu with disabled
"Soon" rows, the image chips 1K, 16:9 and 4 with the model hint and Generate,
the picker above the prompt, and the reasoning levels. No web capture of this
surface exists, because the web preview routes do not include the composer.
The comparison is against the web sources cited above.

These differences remain. The native chip row wraps in the 420-pixel window,
where the web goes icon-first on one line below 520 pixels. Native menu rows
have no secondary descriptions or subheaders, because `Ui.MenuItem` shows a
caption only for disabled rows. The picker is inline above the prompt and lists
assets only, without web entities, rename or thumbnails. Presets, the cost
estimate, the provider-setup banner, the permission selector, slash commands,
prompt history, dictation and Enter-to-send are absent. Media settings,
reasoning level and recent assets last for the session, where the web persists
settings and the level. Thread headings have no letter spacing. F36 is not
accepted.


## F22 document property evidence

F22 is partial and is not accepted. The missing embedded 3D viewer is
user-approved scope change SC2 in the
[parity inventory](parity-inventory.md#user-approved-scope-changes).

[DocumentPropertyEditor](../qml/DocumentPropertyEditor.qml) uses a select
and adjacent compact icon button. New, Refresh and the status line are removed.
[DocumentPickerController](../src/properties/DocumentPickerController.cpp) no
longer exposes creation or sends create requests. The list contracts remain
GET `/trpc/sketch.list`, `/trpc/timeline.list`, `/trpc/scripts.list` and
`/trpc/storyboards.list`, with `{result: {data: [...]}}` responses.
The icons use the same Material paths as the web fields. Timeline's fallback
label is `Untitled video`. The open button has the per-type `Open in <kind>
editor` accessible name and tooltip and is disabled without a selected ID.

Loading and error rows are disabled options inside the select. A stored ID
missing from the list displays an empty select and keeps its reference, as
[the web select](../../../web/src/components/properties/DocumentPickerProperty.tsx)
does without `renderValue`. Selecting another row writes a fresh `{type, id}`
reference. Storyboard also writes `data: null`. Same-ID selection emits no
commit. Lists remain fresh for 30 seconds. Application activation and opening
the menu refetch stale lists. Menu opening is the native fallback for returning
from a browser without an application activation notification. This cache is
per field instance, unlike the web's shared query cache.

Sketch opens `/sketch/<id>` and timeline opens `/timeline/<id>`.
[ScriptProperty](../../../web/src/components/properties/ScriptProperty.tsx) and
[StoryboardProperty](../../../web/src/components/properties/StoryboardProperty.tsx)
omit `standaloneRoute`. Their shared web handler opens a workspace tab and
navigates to `/workspace`. Native instead uses the existing
`/studio/script/:scriptId` and `/studio/storyboard/:boardId` routes, declared at
lines 505 and 504 of [the router](../../../web/src/index.tsx). These retain the
selected ID when opening an external browser. This is a navigation difference
from the web property fields. The native workflow remains open. Browser launch
is tested with a QDesktopServices URL handler, not a real external browser.

[Model3DPropertyEditor](../qml/Model3DPropertyEditor.qml) adds a URL toggle,
URL entry and file drop through the existing AssetPickerController multipart
upload path. The inspector widget enables native drops. Upload commits
`{type: "model_3d", uri: "asset://<id>", asset_id}`, matching
[mediaRefFromAsset](../../../web/src/utils/mediaRef.ts). URL commits
`{uri, type: "model_3d"}`. The inspector supplies its label. Connected fields
show the existing link icon, matching the web ConnectedBadge. The preview space shows the asset name and thumbnail
when metadata supplies one. AssetPickerController reads `assets.get` and
resolves relative `thumb_url` values against the server origin.
No Qt Quick 3D dependency or viewer was added. Native has no example-model
drag source or decoder in the inspected node-editor sources, so example-model
drops are not implemented.

[DocumentPropertyTest](../tests/ui/DocumentPropertyTest.cpp) uses a fake HTTP
server with tRPC list arrays, asset metadata envelopes and multipart upload
responses. It asserts that New, Refresh and the status line are absent, and
covers disabled loading/error options, missing selection display, exact
reference shapes, open targets and credential invalidation. The real
EditorWindow inspector test uses pointer events for URL entry and sends native
drag-enter, drag-move and drop events through the inspector widget. It checks
upload shape, undo/redo, URL and repeated-upload same-value no-ops, and tab
close with a list response in flight. The four document captures also use
the real inspector.

Two deliberate mutations were run together. Replacing upload `asset_id` with
`id` failed the exact reference comparison. Reintroducing a New control failed
the absence assertion for all four document types. The mutation run exited 8
with five failing cases. Both mutations were restored before final validation.

Captures are emitted only through `NODETOOL_DOCUMENT_PROPERTY_CAPTURE_DIR`.
This round used `/tmp/f22-current-captures` and opened every PNG at original
resolution: `sketch-dark.png`, `sketch-light.png`, `timeline-dark.png`,
`timeline-light.png`, `script-dark.png`, `script-light.png`,
`storyboard-dark.png`, `storyboard-light.png`, `model3d-empty-dark.png`,
`model3d-empty-light.png`, `model3d-filled-dark.png` and
`model3d-filled-light.png`. The document fields have a label above a single
select/icon row without clipping or extra actions. Empty 3D fields show the
URL control and drop prompt. Filled fields show `model.glb`. The fake asset
has no thumbnail, so those captures do not verify thumbnail rendering.

Comparison was against the web component source, not a running web screenshot.
The 3D URL field uses native standard field sizing across the inspector width,
while the web uses a compact input capped at 120 pixels. The preview has a
fixed compact native height rather than the web's flex height and contains a
name instead of a live model viewer. Native commits URL drafts on field commit,
while the web writes on each change. Script/storyboard open targets and
per-instance list caching differ as described above. No example-model drag
producer was found in the inspected native editor sources.

Focused verification uses only
`<build-root>/node-editor-autosave-host-build`:

- `cmake --build <build-root>/node-editor-autosave-host-build --target node_editor_document_property_tests --parallel 3`
  exited 0 after the concurrent chat syntax and host-header changes settled.
- `NODETOOL_DOCUMENT_PROPERTY_CAPTURE_DIR=/tmp/f22-current-captures QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software ctest --test-dir <build-root>/node-editor-autosave-host-build -R '^node_editor_document_property$' --output-on-failure --timeout 200`
  exited 0 with the focused target passing.
- `python3 native/ui_primitives/tools/check_design.py --strict` exited 0.
- `python3 native/ui_primitives/tools/check_dependencies.py` exited 0.

## Remaining property editors, F21 and F23

These rows remain partial and are not accepted. The additions are
[RemainingResourcePropertyEditor](../qml/RemainingResourcePropertyEditor.qml),
[ToolsPropertyEditor](../qml/ToolsPropertyEditor.qml),
[PathPropertyEditor](../qml/PathPropertyEditor.qml),
[MediaParameterPropertyEditor](../qml/MediaParameterPropertyEditor.qml), and
[FilePropertyEditor](../qml/FilePropertyEditor.qml). PropertyField routes their
commits through WorkflowDocument. Document assets reuse AssetPropertyEditor.
The existing workflow, workflow-list, collection, color, and image-size editors
were skipped. F20 model pickers and F22 document editors are separate work.

### Web contracts

- Fonts use `GET /trpc/fonts.list` with `{}` and read `{fonts: [{name,
  portable, ...}]}`. Server order and portable labels follow
  [FontProperty](../../../web/src/components/properties/FontProperty.tsx).
  That component has no font-face preview. No font was bundled by this change.
- Folders use `GET /trpc/assets.list` with `{content_type: "folder",
  project_id}` and read `{assets, next}`. Creation uses multipart
  `POST /api/assets/`, with a `json` part containing `{parent_id,
  content_type: "folder", name}`. Creation refreshes the list without selecting
  the new folder. See
  [FolderProperty](../../../web/src/components/properties/FolderProperty.tsx)
  and [AssetStore](../../../web/src/stores/AssetStore.ts).
- Entities use `GET /trpc/assets.search` with `{query: "", page_size: 1000,
  project_id}` and read `assets`. The controller maps the
  `metadata.nodetool_entity` marker into the entity cache, preserving full asset
  IDs. See [useEntities](../../../web/src/serverState/useEntities.ts) and
  [EntityProperty](../../../web/src/components/properties/EntityProperty.tsx).
  Existing wrapper fields and prior list entries survive selection.
- Document assets reuse `GET /trpc/assets.search` with `{query, page_size: 100,
  content_type: "document"}` and optional cursor, reading `{assets,
  next_cursor}`. Reference verification uses `GET /trpc/assets.get` with `{id}`.
  Uploads reuse the native asset controller's multipart `POST /api/assets`.
  The web [DocumentProperty](../../../web/src/components/properties/DocumentProperty.tsx)
  uses [PropertyDropzone](../../../web/src/components/properties/PropertyDropzone.tsx)
  for document constant/input nodes. Its Electron branch calls
  `window.api.dialog.openFile` with document extensions, then reads the local
  file buffer. The native picker uses Qt's file dialog and local file upload.
- Media constraints use `GET /trpc/models.imageByProvider` or
  `GET /trpc/models.videoByProvider` with `{provider}`. Both return arrays.
  The selected full model ID identifies its constraint row. Unknown models and
  failed requests leave the static vocabulary available. See
  [useMediaModelConstraints](../../../web/src/hooks/useMediaModelConstraints.ts)
  and [MediaPickerProperties](../../../web/src/components/properties/MediaPickerProperties.tsx).
- Paths store plain strings. The desktop choice follows the Electron branch
  in [BasePathProperty](../../../web/src/components/properties/shared/BasePathProperty.tsx):
  native file/folder dialogs and an empty string to clear. Offscreen tests
  inject a dialog provider. A generation check rejects an older dialog result.
- Tools preserve the web's individual tools and grouped browser/sandbox IDs
  from [ToolsListProperty](../../../web/src/components/properties/ToolsListProperty.tsx).
  [FileProperty](../../../web/src/components/properties/FileProperty.tsx) only
  displays a reference ID. Neither component has a server picker route.

### Behavior contracts under verification

Folder and entity lists receive the active workflow's `project_id` from
`EditorWindow::properties()`. An unfiled workflow uses the browser project
selection, then `default`. A project change cancels the old key, clears rows,
and refetches. The web scopes these fields in
[FolderProperty](../../../web/src/components/properties/FolderProperty.tsx)
and [useEntities](../../../web/src/serverState/useEntities.ts), using
`activeProjectId ?? LOOSE_PROJECT_ID`. Workflow single/list properties call
`load("", 200)` without a project argument. Fonts and collections are unscoped.

[DocumentProperty](../../../web/src/components/properties/DocumentProperty.tsx)
uses a dropzone only for `nodetool.constant.Document` and
`nodetool.input.DocumentInput`. Other nodes display `value.id`. Native dispatch
now follows those rules. The dropzone branch loads asset metadata and resolves
a local copy through MediaResolver. TXT and HTML show plain text, with no HTML
execution. Open document uses that local copy. Native has no embedded PDF or
sandboxed HTML viewer, which is user-approved scope change SC3 in the
[parity inventory](parity-inventory.md#user-approved-scope-changes). The
closest behavior is the text preview and explicit external open. DOC and DOCX display the asset name, as on the web.

[BasePathProperty](../../../web/src/components/properties/shared/BasePathProperty.tsx)
passes no extension filters to Electron's `openFile` or `openFolder`. Native
paths therefore accept all files or directories. Document uploads use the
[PropertyDropzone](../../../web/src/components/properties/PropertyDropzone.tsx)
filter: PDF, DOC, DOCX, TXT and HTML. Its Electron branch reads the chosen local
file buffer and uploads it. Native uploads the chosen local file directly.
Offscreen tests inject dialog results into the inspector controls.

[PropertyBehaviorTest](../tests/ui/PropertyBehaviorTest.cpp), registered as
`node_editor_property_behavior`, uses the real EditorWindow inspector and a
local HTTP server. Response contracts come from the
[asset router](../../../packages/websocket/src/trpc/routers/assets.ts),
[font router](../../../packages/websocket/src/trpc/routers/fonts.ts),
[model router](../../../packages/websocket/src/trpc/routers/models.ts),
[workflow router](../../../packages/websocket/src/trpc/routers/workflows.ts),
[collection router](../../../packages/websocket/src/trpc/routers/collections.ts)
and [multipart handler](../../../packages/websocket/src/http-api.ts).
Disabling `onProjectIdChanged` made `projectChangeDiscardsOldResponse` fail:
the expected `project-b` rows never arrived. Removing `reply->abort()` from
AssetPickerController cancellation made `uploads:cancel-delayed-upload` fail:
the fake server socket remained connected. Both mutations exited 1 and were
restored. These rows remain partial.

Focused verification used the existing build directory. Its
`CMAKE_HOME_DIRECTORY` points to this worktree's `native/node-editor`.

- `cmake --build <build-root>/node-editor-group-gesture-build --target node_editor_property_behavior_tests --parallel 3` exited 0.
- `QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software ctest --test-dir <build-root>/node-editor-group-gesture-build -R '^node_editor_property_behavior$' --output-on-failure --timeout 200` exited 0. The test passed in 24.36 seconds.
- `python3 native/ui_primitives/tools/check_design.py --strict` exited 0.
- `python3 native/ui_primitives/tools/check_dependencies.py` exited 0.

### Evidence and limits

[RemainingPropertyTest](../tests/ui/RemainingPropertyTest.cpp) is registered as
`node_editor_remaining_property`. It drives pointer clicks and keyboard menu
selection, uses a local HTTP fake with tRPC response envelopes, and checks
missing resource references, full IDs, wrapper metadata, undo, same-value
no-ops and account invalidation. Local path tests inject dialog results and
reject a result from an earlier generation. The tests exercise the individual
editors and WorkflowDocument rather than the whole inspector.

Mutation checks removed the single-resource same-ID guard and the path-dialog
epoch guard. The focused test failed for font/folder/entity extra commits and
for stale file/folder-path commits. Both guards were restored. The same-value
WorkflowDocument boundary already rejected identical snapshots before this
change. Its implementation was not changed. The inspector behavior tests above also mutation-test upload network
cancellation and project-change invalidation.

Captures are opt-in through `NODETOOL_REMAINING_PROPERTY_CAPTURE_DIR`.
Entity fields now show selected chips and open a card picker with square
reference previews, names, kind badges and selection outlines. Single and
list selection share that picker. Tools show selected icons and an add/remove
menu. Media parameters use the shared `Ui.ChipMenu`. Folder creation opens a
popover beside its select. Paths put Browse, the preview and Clear in one row.
Fonts use a plain select with portable labels and a separate refresh icon.
File references use body text and preserve the full ID.

The tool mutation removed `root.valueCommitted(next)` from
[ToolsPropertyEditor](../qml/ToolsPropertyEditor.qml). The pointer test failed
with zero commits instead of one. The commit was restored. Card selection,
tool toggles and chip menus have pointer and keyboard coverage.

Visual differences remain. Entity chips use kind icons instead of colored
dots, and the native kind badges do not reproduce every web kind color.
The picker bounds its scrolling card grid. The card fixture covers the
missing-preview placeholder, not authenticated
reference-image rendering. Tool menus use a leading check mark instead of
the web's trailing checkbox. Media menus use a vertical option list without
the web's aspect-ratio diagrams, headers or separate strength descriptions.
The chip height and typography follow native metrics. Folder and font controls
retain a refresh icon absent from their web components. Paths use Qt dialogs.
Document assets still show upload/search controls and plain text preview,
without embedded PDF or sandboxed HTML viewers. The installed Qt QML modules
include neither QtPdf nor QtWebEngine. This is user-approved scope change SC3
in the [parity inventory](parity-inventory.md#user-approved-scope-changes).

The entity create/open flow is blocked on a host contract. The web
[EntityPicker](../../../web/src/components/entities/EntityPicker.tsx) calls
`EntityLibraryStore.requestCreate()` and `openPageTab("entities")`.
[openPageTab](../../../web/src/components/workspace/openPageTab.ts) changes
in-process workspace state and opens `/workspace`. That URL alone does not
select the Entities page or start its add flow. There is no native entity
library host or inspected deep link that performs these actions. The entry is
hidden. [pageTabs](../../../web/src/components/workspace/pageTabs.ts) explicitly
defines these pages as workspace tabs rather than routes.

Other unfinished work includes active-project propagation into folder/entity
requests, document preview/open, document-node-specific display restrictions,
full native file-dialog behavior and extension filters, and full-inspector
connected/read-only and tab-close interaction tests. Folder creation,
provider-constraint narrowing and document uploads need dedicated HTTP/pointer
coverage. The document stale-response check currently covers account reset,
not a delayed upload completion. File references remain display-only as on
the web. Platform accessibility is not verified by the offscreen tests.

The focused target builds its document, controller and media dependencies
without linking node_editor_core. This follows the existing standalone
property tests and avoids unrelated chat-host link changes in a shared
checkout. Verification uses the existing fullscreen build directory and Qt
installation. No other build directory is needed.

Original-resolution capture review covers both `-dark.png` and `-light.png`
for these stems: `font`, `folder`, `entity`, `entity_list`, `document`, `file`,
`file_path`, `folder_path`, `tools`, `media_duration`, `media_strength`,
`media_resolution_image`, `media_resolution_video`, `media_aspect_ratio_image`,
and `media_aspect_ratio_video`. Open entity/folder pickers add `-picker-`,
and tool/media menus add `-menu-` before the scheme. Closed captures use the
first selected option from the pointer test. These are isolated-control
captures, not evidence of complete inspector integration.

## Large graph performance

`node_editor_large_graph` adds nodes individually through `applyCommand`, then
connects, moves and undoes an add at 250, 500, 1,000 and 2,000 nodes. It runs
without a window and with a shown window. Timings below use an AMD Ryzen 5 3600
6-Core Processor, Qt 6.12.0, the offscreen platform and software Quick rendering.
The CMake build has no optimization or sanitizer flags.

| Mode | Nodes | Add (µs) | Connect (µs) | Move (µs) | Undo add (µs) | Event loop (µs) |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Document | 250 | 16.63 | 68.11 | 16.31 | 0.93 | 33.64 |
| Document | 500 | 16.46 | 51.78 | 11.03 | 0.92 | 441.35 |
| Document | 1,000 | 16.37 | 57.51 | 14.26 | 0.91 | 1,032.67 |
| Document | 2,000 | 16.49 | 53.00 | 12.63 | 1.12 | 93.90 |
| Shown window | 250 | 439.46 | 592.06 | 395.46 | 342.34 | 53,577.40 |
| Shown window | 500 | 451.53 | 550.76 | 406.10 | 385.80 | 52,973.30 |
| Shown window | 1,000 | 468.14 | 636.35 | 440.15 | 407.35 | 104,600.00 |
| Shown window | 2,000 | 549.87 | 771.88 | 497.76 | 444.45 | 208,066.00 |

The `drag` case drags a card with real pointer moves across 72 parity-fixture
cards and a 3,400-entry catalog, the size of the server catalog, and repaints
after each move. Each card's bounds were recomputed on every view query, and
each port visibility check scanned the catalog, so one move took over 5 s. The
layout now caches its bounds and the model indexes the catalog by node type, so
a move takes about 10 ms in the unoptimized build. Most of that is painting the
grid and wires.

Add averages cover the interval since the previous checkpoint. The 2,000-node
cost is 0.99× the 250-node cost without a window and 1.25× with a shown window,
within the test's 3× bound. Before indexed storage and delta undo, document adds
at 2,000 nodes averaged 7,307 µs. Synchronously serializing the document into the
session after each edit took about 23 ms per shown-window add at that size.

The session reads the live document lazily. Edits invalidate its snapshot
cache, increment its edit counter, mark it dirty and start the autosave debounce
synchronously. Snapshot readers serialize the live document once per edit
counter. Save requests and autosave responses read that live snapshot, so a
response arriving in the edit's turn cannot reload an older graph or clear undo.
Opening a workflow after an edit in the same turn binds normally. An edit made
after the open request still rejects its response. Remote open and reload
deliberately replace the document. Version restore keeps its undo step, and
server metadata reconciliation does not count as a local edit.

Each edit requests one scene projection for the next event-loop turn. The
projection diffs nodes and wires against the previous one and emits the QtNodes
fine-grained signals, so unchanged node items, their cached card layouts and the
selection survive. A replaced document, a changed catalog, read-only state or
workflow ID reset the scene instead. `panelChanged` is coalesced to one emit per
turn on the tab and on its owner window. That emit first delivers the session's
queued edit notification and runs a still pending projection, so their changes
share it. Run-output changes reach the panels at most every 100 ms.

Imperative scene readers project pending edits through `ensureProjected`:
`selectNode`, `scene()`, `fit`, `action`, `authoredAction`, undo, redo and
complex authoring results. Document replacement projects before the replacing
call returns. QML property getters do not force projection, so bindings
re-evaluated per command cannot project per command. Removed or changed
inline-title targets reject stale commits synchronously.
`node_editor_incremental_projection` covers the model diff.
`EditorTest::windowEditsProjectIncrementally` covers one projection per turn
without a reset, and the reset for a replaced document. The benchmark measures
event-loop work separately from commands, not input-to-paint latency.

Reintroducing full validation previously made the document case fail at 8.8×
growth. Chat dispatch at 2,000 nodes remains covered by `node_editor_chat_tools`.
Its content-based revision hash still requires graph-wide work. Connection cycle
checks visit the reachable component. These measurements do not accept
[F42](parity-inventory.md).

## Whole-window comparison

This section compares the whole native window with the web editor for
[F39, F40 and F41](parity-inventory.md#visual-and-platform-acceptance). It
records differences, not acceptance.

### Fixture and captures

Both surfaces show the twelve-node, eleven-wire graph in
[`WindowParityFixture.json`](../tests/ui/WindowParityFixture.json). The file
holds the graph and the server metadata of its eleven node types. The states
are an empty canvas, the graph with nothing selected, the Agent node selected
with the inspector open, a run with six completed nodes and two running nodes,
one of them at 12 of 30, the open node catalog, and the open output panel.
Each state has dark and light captures at 1440×900 and 1024×700, at device
pixel ratio 1. Side panels start closed on both surfaces and the web chat window
starts collapsed, so a state opens only its own panel. The run state comes from
the same `job_update`, `node_update` and `node_progress` messages on both
surfaces. They pass through the web run reducer and the native session signals.
The native toolbar shows Stop and the clock only for a run its own session
submitted, so the native running state submits one to the local stand-in server
in [`FakeRunServer.h`](../tests/ui/FakeRunServer.h) and captures it one second
in. That connection also replaces the server variable's backend for the running
and output states.

```bash
NODETOOL_WINDOW_PARITY_CAPTURE_DIR=<dir>/native \
NODETOOL_WINDOW_PARITY_SERVER=http://127.0.0.1:7791 \
  <build>/node_editor_window_parity_tests captures
node native/node-editor/scripts/capture-web-window-parity.mjs \
  --web http://127.0.0.1:3091 --api http://127.0.0.1:7791 --out <dir>/web
```

The [comparison guide](../../../docs/native-node-editor-visual-comparison.md#whole-window-captures)
describes the backend and Vite commands. The server variable connects each
native window to the same backend, so the connection state, Run button and
catalog match. Without it the test runs offline in ctest. The captures in this
comparison were opened at original resolution. Native and web PNG sizes match
for all 24 pairs.

`WindowParityTest` asserts the fixed differences against web DOM measurements
of the same fixture: card height, port positions, progress band height and bar
color, and inspector help placement. Disabling the field classification makes
`cardsFollowWebFieldClassification` fail at a 419 px StringInput card.
Disabling the progress bar makes `runStatusKeepsCardSizeAndShowsProgress` fail
on the bar pixel.

[SelectionPresentationTest](../tests/ui/SelectionPresentationTest.cpp) covers
W8, W9 and the web hover states with real pointer events. Disabling the branch
fade makes the dimming, multi-selection, deselection, group and edit tests
fail. Refitting on selection makes `canvasSelectionKeepsTheZoom` fail, and
removing the inspector pan makes the pan tests fail. Native selected-state
captures at 1440×900 in both themes were compared with the web captures. The
branch (subject, Prompt, Agent, the caption Preview and their wires) stays at
full opacity in both, and the other eight nodes fade to the same level. The
zoom stays at 67% where it fell to 50% before.

[CardBodiesTest](../tests/ui/CardBodiesTest.cpp) loads the same fixture and
drives the bodies with pointer, key and drop events: a prompt edit that keeps a
variable chip, Add another variable, the Blur type and size, the Resize Image
mode switch and lock, a model pick through the shared picker, Add output and an
image drop. A local test server answers the model catalog and asset upload
calls. Card heights are asserted within 2 px of the web capture, read from the
1440×900 PNG at the 71.3% fit zoom. Making the composer read-only makes
`promptEditKeepsVariableChip` fail because no inline editor opens. Native
graph and selected captures at 1440×900 in both themes were compared with the
web captures after the change.

### Differences

Severity is high when the difference changes the window's structure or a card's
size across the whole graph, medium when it changes one surface, and low when it
is visible only on inspection.

| ID | Area | Web | Native | Severity | Status |
|---|---|---|---|---|---|
| W1 | Card fields | A node with `inline_fields` shows those fields as rows and `input_fields` as handles. Other properties stay in the inspector until an edge targets them, which makes them handles. The StringInput card is 129 px tall. | Every property was a row. The StringInput card was 419 px tall with Name, Value and Description. | High | Fixed in `WorkflowGraphModel.cpp`. Model properties keep a row, as web model chips do. Asserted by `cardsFollowWebFieldClassification`. |
| W2 | Card title | Input nodes show their `name` value, such as "subject". | Input nodes showed the type title "String Input". | Medium | Fixed in `WorkflowGraphModel.cpp`. Asserted by `cardsFollowWebFieldClassification`. |
| W3 | Unclassified metadata | Metadata without `inline_fields`, such as Prompt and Fake Generate Image, shows no field rows (`resolveInlineFieldNames` in `web/src/utils/exposedInputs.ts`). Fake Generate Image is 130 px tall. | The same rule. Other properties stay in the inspector until an edge targets them, and an unplaced model property shows a model chip. Fake Generate Image is 129 px tall. | Medium | Fixed in `WorkflowGraphModel.cpp` (`cardField`). Asserted by `CardBodiesTest::cardHeightsMatchWebCapture`. Test fixtures that relied on the old fallback now declare `inline_fields` or `input_fields`: `PropertyFixture.h`, `CompatiblePickerFixture.h`, `BodyConnectionFixture.h`, `InlinePropertyTest`, `IncrementalProjectionTest`, `CanvasMediaTest`, `DynamicPortsTest`, `CodePropertyTest`, `CompatiblePickerHostTest`, `EditorTest` and `BodyDropHostTest`. Not accepted. |
| W4 | Bespoke bodies | Prompt shows a variable composer, Resize Image a mode switch, Blur a select and slider, Preview a 400×300 preview, Output a result placeholder, Image Input a drop zone, Agent a model chip and Add output. Header icons come from `IconForType.tsx`. | `CardBodies.cpp` lays out and `CardBodyPainter.cpp` paints these bodies. The Prompt composer draws each `{{ variable }}` as a chip, warning-colored when no input defines it, and its footer holds Variables, insert chips and Add another variable. Output and Preview draw their empty states. Blur has a type select and a size slider, and Resize Image a Scale, Dimensions and Fit switch with width, height and a lock that links them. Content cards such as Agent add a model chip that opens the shared picker and an Add output button that opens the output form. A file dropped on the Image Input drop zone uploads and sets the value. Card headers draw the web data type SVGs, so Output shows the text icon and Preview the eye. Heights: Prompt 168, Output 150, Preview 400×300, Blur 199, Resize Image 212, Agent 217, Image Input 120. | Medium | Part 1 fixed, parts 2 and 3 partly fixed. Asserted by `CardBodiesTest` with pointer, key and drop events on the parity fixture and on added part 2 and part 3 nodes. Open: the differences in [Card body differences after part 1](#card-body-differences-after-part-1) and [Bespoke bodies for part 2](#bespoke-bodies-for-part-2), and the bodies listed as missing in [Bespoke bodies for part 3](#bespoke-bodies-for-part-3). Acceptance pending. |
| W5 | Card typography and geometry | Width 280, radius 8, 1 px border at 8% white, Inter 13 title in the 400 face, first port at 46 and 28 px steps. | Same measurements. | Low | Matches. |
| W6 | Ports and wires | 12 px handles with a 2 px ring in the card color. Wires are 1.5 px in the source type color. | Same measurements. | Low | Matches. |
| W7 | Grid | 25-unit crosses 3 units wide, which scale with zoom. | Same pattern. | Low | Matches. |
| W8 | Selection | Selecting a node keeps it and every node upstream or downstream of it at full opacity and fades all other nodes, groups, notes and wires to 0.2 (`reactFlowGraphModel.ts` `branchNodeIds`, `markComprehensionEdges`, `nodes.zoomed.css`). With several nodes selected the branches join. A wire is related when both of its ends are. The fade has no transition, so reduced motion changes nothing. The node action toolbar floats above the selected card. | Same rule, at the same 0.2 opacity, through item opacity in `EditorScene.cpp`. Media widgets and group labels follow the card. A single selected card gets the web node toolbar above it, centered with an 8 px gap, and the toolbar follows the card through pan, zoom, resize and move and hides while the card drags. A group, a comment or several nodes keep the canvas toolbar at the top center, where the web shows none. | Medium | Dimming, toolbar position and the delay fixed. Asserted by `SelectionPresentationTest` and `NodeActionsTest` with real pointer clicks. The toolbar appears 200 ms after the card is selected and still (`NodeSelectionToolbar.tsx` `TOOLBAR_SHOW_DELAY`, `useDelayedVisibility`), hides at once on deselect or drag, and restarts its delay when the card is selected again (`toolbarShowsTwoHundredMillisecondsAfterTheSelection`). Acceptance pending. |
| W9 | Selection viewport | A canvas click never moves the viewport. The inspector slides over the canvas and `useClearInspectorOverlap` pans left over 200 ms only when it covers a node, and never past the point where the selected node is 16 px from the canvas edge. Find centers the node at 100% over 300 ms. The node info Focus button centers at 150%. The web editor has no outline. | A selection never refits. The docked inspector narrows the canvas, so native applies the same pan rule to the inspector width, animated over 200 ms and instant under reduced motion or for a programmatic selection. Find centers at 100% over 300 ms, and Focus in the inspector Help tab centers at 150% over 300 ms. | Medium | Fixed in `EditorWindow.cpp`, `InspectorClearance.h`. Asserted by `SelectionPresentationTest`. `EditorTest::fitKeepsEveryNodeVisibleAcrossPanels` changed. Open: native has no node info panel. Its Focus button sits in the inspector Help tab (`ViewportNavigatorTest::inspectorFocusButtonRunsFocus`). Native pans 300 px in the capture where the web pans 371 px, because card sizes and positions still differ. The fit zoom before selection differs (web 71%, native 67%) and is not part of this row. |
| W10 | Running ring | Running cards draw a conic ring in their type colors. | Same ring. | Low | Matches. |
| W11 | Run status on cards | A status changes no card and shows no text. | Every card with a status grew by 98 px and printed "completed" or "running 40%". | High | Fixed in `WorkflowGraphModel.cpp` and `EditorScene.cpp`. Errors and a lost connection keep a label. Asserted by `runStatusKeepsCardSizeAndShowsProgress`. |
| W12 | Node progress | A running content card with a total adds a 47 px band with a "12 / 30" mono count and a 6 px bar in `secondary.main`. | Only subgraph cards showed progress. | High | Fixed in `EditorScene.cpp` with the new `Theme.accentSecondary` role. Asserted by `runStatusKeepsCardSizeAndShowsProgress`. |
| W13 | Header row | A 40 px row under the tab bar holds the workflow name, which renames on double-click, the save state, Undo and Redo, Graph and Chain, the chat, mini-map and inspector toggles, and ⋮ at the right. The bar spans the canvas column, and the catalog and inspector cover its ends. | `HeaderRow.qml` draws the same slots and sizes: 8 px side padding, 28 px buttons 4 px apart, 16 px rules with 8 px gaps, a 28 px Graph and Chain switch, an 8 px save dot and an 11 px caption. Save states are Saved, Saving…, Unsaved changes, Not saved with Retry, Read only, and Server conflict or Server deleted with Review, which opens Server sync. ⋮ opens the existing More menu. The open catalog covers the left end of the bar, as on the web (W17). The bar ends at the inspector dock, so ⋮ stays visible with the inspector open, where the web inspector covers it. The mode switch's selected fill is `Theme.actionSelected`, slightly lighter than the web's. Items sit up to 3 px right of the web positions. | High | Fixed in `HeaderRow.qml` and `EditorWindow.cpp`. `HeaderRowTest` asserts the web geometry and drives rename, save states, history, toggles, ⋮ and the Chain tooltip with pointer and key events. The chat toggle has no conversation count badge. Not accepted. |
| W14 | Floating toolbar | Add node, Auto layout, Run and the workflow menu, 273×46: a 1 px border, 4 px padding, 28 px buttons, 8 px between the tool and run groups, a 36 px Run pill and a 0 8 32 shadow at 40% black. | Same contents, order and sizes, 279×46 with the wider native label. Undo, Redo, Open, Save and Conversation left the toolbar. Undo, Redo and chat are in the header, Open stays on the rail and in the More menu, and the More menu gains Save for the local file. The Ctrl+S and Ctrl+O shortcuts are unchanged. No shadow. | Medium | Fixed in `Toolbar.qml`. Asserted by `HeaderRowTest::geometryFollowsWeb`. Changing the padding back to 6 px fails it at a 48 px toolbar. The shadow is W26. Not accepted. |
| W15 | Toolbar run state | A Stop button and an elapsed "0:01 Running" pill on the panel surface replace Run. | For a run this session submitted, Stop appears before the pill, the pill turns to the panel surface, and an `M:SS` clock in semibold mono precedes "Running" from the first running update. Esc and Stop cancel the run. A run that another client started shows no Stop or clock. The running capture shows the same toolbar as the web, and the session's job also opens the queue overlay that the web capture, with its injected messages, does not show. Instant Update does not hide the clock as it does on the web. | Medium | Fixed in `Toolbar.qml`. `HeaderRowTest::toolbarStopsAndTimesASubmittedRun` submits a run to `FakeRunServer`, reads 0:00 and then 0:01, and clicks Stop, which sends `cancel_job`. Not accepted. |
| W16 | Tab bar | Project chip, tabs, and notification and settings icons on the right. The bell lists notifications with a dot for unread ones, and Settings opens the settings page (`WorkspaceTabBar.tsx`, `NotificationButton.tsx`, `SettingsHeaderButton.tsx`). | `TabBar.qml` ends with the same 28 px bell and settings buttons, 4 px apart and 4 px from the edge, with the web accessible names. Session, run and canvas upload errors become notifications. The bell shows a secondary-color dot while some are unread and opens `NotificationsPanel.qml`, which lists them with a type-colored edge, the time and Copy, or "No notifications". Settings opens the `/settings` page of the connected server in the browser, because native has no settings page. The web activity indicator before the bell, the bug report action and the Ctrl+, shortcut are missing. | Low | Fixed in `TabBar.qml`, `NotificationsPanel.qml` and `EditorPanels.cpp`. Asserted by `ChromeParityTest::tabBarEndsWithNotificationsAndSettings`. Acceptance pending. |
| W17 | Catalog | The left panel overlays the canvas without changing zoom. Search is focused, with a provider filter and an API key notice. Categories are media types with icons, and Agent leads the list. The header title has a description tooltip and an open-in-new link to the nodes documentation (`PanelHeader` with `docsTopic="nodes"`). | Categories, order, labels, icons, counts and the footer label match the web (`NODE_SUBCATEGORIES` in `web/src/config/quickAccessCategories.tsx`, `NodeLibrary.tsx`). Hidden nodes are left out. The panel is an overlay over the canvas column, so the canvas keeps its size and zoom, and it covers the left end of the header row as the web panel does. Opening it focuses the search. The provider filter chip appears with two or more providers. Once the server's secrets load, nodes whose provider key is missing are left out, and a notice counts them with Show them and Hide them, stored under `catalog/showNodesWithoutKey`. Before the secrets load every node is listed, where the web hides key-gated nodes. Vertex AI, Codex and Claude Code are not gated, because their gate is the server's provider list, which native does not read here. Agent leads the list through the quick-action boost. The header has the title tooltip and the documentation link. An optional packs block follows the list. | Medium | Fixed in `CatalogCategories.cpp`, `Catalog.qml`, `PackSetup.cpp` and `EditorWindow.cpp`. Asserted by `ChromeParityTest` (`catalogCategoriesFollowTheWebOrderLabelsAndCounts`, `catalogClassifiesNodesAsTheWebDoes`, `catalogCategoryClickFiltersTheList`, `catalogOverlaysTheCanvasWithoutChangingTheZoom`, `catalogFocusesTheSearchWhenItOpens`, `catalogHeaderLinksTheNodesDocumentation`, `catalogHidesNodesThatNeedAMissingKey`). The W26 shadow is missing. Acceptance pending. |
| W18 | Default panels | Side panels start closed. | The catalog starts closed. The captures open it only for the catalog state. `EditorTest` and `SetupHostTest` open it first. | Medium | Fixed in `EditorWindow.cpp` (`web/src/stores/PanelStore.ts`). Asserted by `catalogStartsClosedAndTheRailNodesEntryTogglesIt`. Not accepted. |
| W19 | Inspector field help | A description is the label tooltip. A field at its default shows no hint and no reset action. | Each field printed its description, "Using the metadata default." and a "Use default" action. | High | Fixed in `PropertyField.qml`. Asserted by `inspectorShowsDescriptionsAsTooltips` and `EditorTest::propertyBooleanStoresBool`. |
| W20 | Inspector footer | `RunSelectedNodesSection.tsx`: Runs with a stepper from 1 to 32, and Run selected, which runs the selection that many times and stops at the first run that does not complete, with a "Run 2/3" caption. Under the inspector, `PanelRight.tsx` shows a collapsed "Cost estimate" row whose caption is the per-run total, such as "$0.12 / run", "$0.12 · incomplete" or "Per run". The web computes it in the browser with `estimateWorkflowCost`. | The inspector ends with the same footer. Runs, the stepper and Run selected call `runSelectedNodes`, which submits the next run when the previous job completes. A "Cost estimate" row follows, with the caption from the server's static preflight (`POST /api/sdk/v1/preflight`), which runs the same `estimateWorkflowCost` on the saved workflow. It refreshes after each open and save, so unsaved edits are not priced, and it is hidden for a workflow that is not saved to a server. The preflight returns a total without per-node rows, so an estimate reads "~" and a lower bound cannot be marked "≥". The row does not expand into the per-node table. | Medium | Fixed in `Inspector.qml`, `EditorPanels.cpp` and `WorkflowSession.cpp`. Asserted by `ChromeParityTest::inspectorFooterRunsTheSelectionRepeatedly` and `inspectorShowsTheServerCostEstimate`. Acceptance pending. |
| W21 | Inspector media fields | One drop zone per media list, at least 80 px tall, reading "Click or drop images here" in capitals, which opens the file picker on click (`ImageListProperty.tsx`, `AudioListProperty.tsx`, `VideoListProperty.tsx`). | A media list shows its items and one drop zone with the web prompt and tooltip. A click or Enter opens the file picker, and dropped files upload. The search field, Browse and Upload buttons, the asset select and the drop line are gone from lists. Single media fields keep them. Items keep Up, Down and Remove buttons where the web shows a thumbnail grid with a remove button. | Medium | Fixed in `AssetPropertyEditor.qml` (`dropZoneOnly`) and `MediaListPropertyEditor.qml`. Asserted by `ChromeParityTest::inspectorMediaListHasOneDropZone`. Open: the thumbnail grid. Acceptance pending. |
| W22 | Inspector width | 350 px when it first opens (`stores/RightPanelStore.ts` `sizes.initial`). The comparison captures showed 380 px because the capture script seeded that width. | 350 px. | Low | Matches. The capture script now seeds 350 px. Asserted by `ChromeParityTest::inspectorOpensAtTheWebWidth`, which passed before any change. Acceptance pending. |
| W23 | Output panel | The bottom panel takes the status bar as its tab strip, so an open panel puts the bar above its body. The Logs view shows a run picker, which reads "No recent runs" without runs, the "No recorded runs" empty state, and 32 px rows (`PanelBottom.tsx`, `TracePanel.tsx`). | While the Output panel is open, the status bar moves to its top and the body follows below it. The body has no title row or close button, and the Logs tab closes it. The run picker is always shown and reads "No recent runs" when there are none. The empty state uses the web title and description. Rows without content are one 32 px line. The native body lists the session's run events and outputs, where the web Logs view lists stored log events of the run. Versions and Trace open their own bottom panels, which keep the status bar below them. | Medium | Fixed in `RunOutput.qml` and `EditorWindow.cpp` (`placeStatusBar`). Asserted by `ChromeParityTest` (`outputPanelUsesTheStatusBarAsItsTabStrip`, `outputPanelShowsARunPickerAndAnEmptyState`, `outputRowsAreCompact`). `EditorTest::outputDockKeepsDocumentHistory` changed its empty-state text. Open: the stored-log list and the status bar above the Versions and Trace panels. Acceptance pending. |
| W24 | Status bar | Connection, panel tabs from Logs to Trace, counts, CPU and memory. A tab shows whether its panel is open, and the open view's tab closes the panel. The bar has no message text. | Connection (Connected, Offline or Idle), Logs, Queue, Generations, Workers, Versions and Trace tabs, node and edge counts, and CPU and memory from the server's `system_stats`. Logs, Versions and Trace show the open state and close their panel when clicked again. Queue expands the queue panel while jobs exist. Generations and Workers stay disabled with a reason. The run message left the bar. It stays in the inspector and errors reach the tab bar notifications. The Connect button for an offline session is native. | Medium | Fixed in `StatusBar.qml` and `EditorPanels.cpp` (`toggleStatusView`). Asserted by `statusBarHasTheWebItemsInOrder`, `statusBarTabsOpenNativePanelsOrExplainWhyNot`, `statusBarShowsServerStatsAndTheQueue` and `statusBarTabsShowAndToggleTheirPanels`. The remaining gaps are C8, C9, C11, C12 and C13 below, the Generations count and the L and Ctrl+Shift+T shortcuts. Acceptance pending. |
| W25 | Rail | Logo menu, Projects, Documents, Chats, Library, Entities, Examples, Nodes and More, then a theme toggle and a panel toggle. Each has a tooltip. | The same entries in the same order and icons, with the same tooltips. Documents opens the workflow browser, Chats the native conversation, and Nodes the catalog. Projects, Library, Entities, Examples and More are disabled with a reason. The logo has no menu. The native Inspector and Output entries left the rail. | Low | Partly fixed in `Rail.qml` (`PanelLeft.tsx`, `QuickAccessSidebar.tsx`, `ThemeToggle.tsx`). Asserted by `railHasTheWebEntriesInOrder`, `railTooltipsNameEntriesAndExplainDisabledOnes` and `railEntriesOpenTheirNativePanels`. The gaps are in the table below. Not accepted. |
| W26 | Elevations | The toolbar, viewport control, side panels, bottom panel and Preview and Output cards cast shadows. | Flat, as the [native design](../../ui_primitives/DESIGN.md#appearance) requires for persistent chrome. | Medium | Scope change [SC4](parity-inventory.md#user-approved-scope-changes): the user decided to keep persistent chrome flat. |
| W27 | Mini-map | Hidden by default behind a header toggle. The choice is stored. Its light-theme surface is `grey[100]`, which is dark. | Hidden by default. `editor.setMiniMapVisible` and the Command menu action "Toggle mini-map" change it for every tab and store it under `minimap/visible`. A new window starts as the user left it. Colors follow the web source, including the dark light-theme surface. | Medium | Fixed in `EditorWindow.cpp` (`web/src/stores/MiniMapStore.ts`). Asserted by `miniMapIsHiddenByDefaultAndTheChoiceIsRemembered`. The color mode and legend are asserted by `ViewportNavigatorTest::miniMapColorsFollowTheColorMode` and `miniMapPaletteMenuAndLegend`. The header toggle is in `HeaderRow.qml`, and `HeaderRowTest::togglesOpenPanels` clicks it. Not accepted. |
| W28 | Chat window | Opens by default unless the viewport is narrower than 1200 px, until the user opens or closes it (`stores/CanvasChatDockStore.ts`). The capture script seeds it collapsed. | The same rule. Without a stored choice the chat window opens when the window is at least 1200 px wide. A toggle stores the choice. The window parity and chrome tests seed it collapsed, as the web captures do. | Low | Fixed in `EditorChat.cpp`. Asserted by `ChromeParityTest::chatOpensByDefaultOnAWideWindow`. Acceptance pending. |
| W29 | Chain view | Graph and Chain switch the canvas and the linear chain editor in `WorkflowChainSurface.tsx`. | No chain view. Chain is disabled, and its tooltip says the chain view is not available in the native editor yet. | Medium | Scope change [SC5](parity-inventory.md#user-approved-scope-changes): the user decided not to build a chain view. `HeaderRowTest::togglesOpenPanels` asserts the disabled option and its tooltip. |
| W30 | Disabled card | A bypassed card has `opacity: 0.8` and `filter: saturate(0.2)` over the whole node, handles included (`nodes.states.css` 38-41). | The card, its handles and the chip are painted into an image, desaturated with the CSS saturate matrix, and drawn at 0.8 (`NodePainter::paintDesaturated` in `EditorScene.cpp`). Wires are not filtered, as on the web. | Medium | Fixed. Asserted by `CanvasChromeTest::disabledCardIsDesaturated`, which reads the output handle pixel of a disabled and an enabled card. Acceptance pending. |
| W31 | Disabled chip and title | The chip is the compact outlined warning `MuiChip` of `NodeHeader.tsx` 345-352: 24 px high, 8 px label padding, a 1 px border at 50 percent and a 12 percent fill, a 6 px margin before it (`ThemeNodetool.tsx` 429-457, `nodes.states.css` 62-65). A bypassed title is drawn at 0.8 inside the card's 0.8 (`nodes.states.css` 56-58). | `disabledChipRect` gives the chip, and the title takes the room the chip needs. The title is drawn at 0.64 overall. | Low | Fixed. Asserted by `disabledChipFollowsTheCompactChip` and `disabledTitleIsFainterThanTheCard`, which measures a ratio of 0.64 to 0.8 between the title peaks. Acceptance pending. |
| W32 | Wire styles | A bypassed wire dashes 5 5 in user units, not stroke widths (`nodes.states.css` 66-69). A streaming wire is 3 wide at 0.8 opacity dashed 30 3, or 8 when selected. A flowing wire (`message_sent`) dashes 14 10 with round caps and scrolls 120 px a second, 4 2 and still under reduced motion. Selected and hover rules apply to bypassed wires too. A control wire widens to 3 at full opacity on hover and casts a glow when selected (`handle_edge_tooltip.css` 80-230). | Pen dashes are set in pixels with flat caps, the flowing wire replaces the solid stroke instead of overlaying it, and the glow and hover filter no longer skip a bypassed wire. Before the change a bypassed wire's dashes measured 7.5 px and a flowing wire kept its solid stroke under a thin overlay. | Medium | Fixed. Asserted by `bypassedWireDashesFivePixels`, `selectedBypassedWireKeepsItsGlow`, `streamingWireDashesThirtyAndThree`, `flowingWireDashesAndScrolls` and `hoveredControlWireWidensAndBrightens` by measuring dash runs along the rendered wire. Acceptance pending. |
| W33 | Grouped card | A card inside a group has a 1 px edge of `c_node_header_bg_group` at 82 percent over primary, and the fill `#222` (dark) or `#ccc` (light) at 0.55 in place of the card color until it runs (`selectionStyles.ts` 65-73, `BaseNode.tsx` 452-456). | The `groupHeader` and `groupFill` roles in `EditorRoles.qml` feed the painter. A running grouped card keeps the card color. | Medium | Fixed. Asserted by `groupedCardTakesTheGroupEdgeAndFill` in both themes against the pixel behind the card. Acceptance pending. |
| W34 | Collect handle | A `list[T]` input whose element type is not `any` is a ring with a card-colored core, `radial-gradient(bg 0 2px, transparent 2.5px)` (`handle_edge_tooltip.css` 143-151, `PropertyField.tsx` 162, `utils/TypeHandler.ts` `isCollectType`). | The same core is painted over the handle. | Low | Fixed. Asserted by `collectHandleHasAHollowCore`. Acceptance pending. |
| W35 | Handle cursor | A handle shows `cursor: cell` and the cursor is hidden over handles while a wire is connecting (`handle_edge_tooltip.css` 25-60). | Qt has no cell cursor, so a handle shows the cross, which is the same plus sign. The cursor goes blank over a handle during a wire drag. Hover sets it on the card item because a Graphics View resets its viewport cursor from the item under the pointer. | Low | Fixed. Asserted by `handlesShowTheCellCursorAndHideItWhileConnecting` with pointer events. Acceptance pending. |
| W36 | Overview zoom | At zoom 0.35 and below handles are hidden, property rows and labels hide, the icon hides and the title is grey 200 at full opacity, the card body draws at 0.85, wires are 6 wide, and a selected card has a 4 px ring in its node color over a `0 2px 8px` shadow (`nodes.zoomed.css`, `config/constants.ts` `ZOOMED_OUT`). | The painter reads the view zoom and applies the same set, with the `zoomedTitle` role. Bespoke card bodies stay, because their layout belongs to the body painter. Handles stay hit-testable where the web sets `pointer-events: none`. | Medium | Fixed in the painting. Asserted by `zoomedOutCardsHideHandlesAndThickenWires` and `overviewZoomThickensWires`. Open: the pointer rule. Image and video property rows, which the web keeps visible, were not checked. Acceptance pending. |
| W37 | Preview and Output edges | A selected Preview card is edged in `grey[100]` and a selected Output card in `info.main` at 82 percent over white. Both carry `SHADOW.sm` in every state (`selectionStyles.ts` 22-45). | The `previewSelected` and `outputSelected` roles set the edge, and both cards draw the shadow unselected. | Low | Fixed. Asserted by `previewAndOutputCardsTakeTheirSelectedEdge` in both themes. Acceptance pending. |

### Card body differences after part 1

The 1440×900 graph and selected captures in both themes show these differences.
Updated card captures are kept outside the repository in a local build cache.
The eight focused
card/window/interaction suites passed. Three card/window/media suites passed
again after shared result-rectangle extraction. These captures retain different
viewport fit from the web and use an offline fixture.

1. Bespoke inputs without a web handle retain their canonical ports and edges,
   but draw no dot or wire and accept no handle or wire hit. This includes the
   connected Prompt prompt and the fixture's connected Resize Image and Fake
   Generate Image width fields. `CardBodiesTest` covers exposure changes,
   save/reopen, undo, opaque edge metadata, ordinary wires and control ports.
2. Empty model fields now use account-scoped pins or available language, image
   and TTS seeds without an undo entry. Language seeds follow all eight protocol
   curated entries before ranked recommendations. Task-specific image pins use
   global fallback when absent. Legacy pins and explicit choices remain intact.
   [Model default policy](model-default-policy.md) records the contract.
   `ModelPickerTest`, document tests and the shared picker suite passed, with an
   independent review. Offline fixtures without a catalog still show Select model.
3. Get Metadata has the web's 72-pixel natural card height. Its output centers
   are 46, 74, 102, 130 and 158. Graphics bounds include overflow handles without
   enlarging the card. Authored supported dimensions remain honored.
4. Integer Input places a 28-pixel value editor at y=55 below its label, with a
   94-pixel natural card height. Native tests cover authored sizes and activation.
5. Prompt variable chips now insert at the active caret or replace the current
   selection, retaining the draft until commit. Escape cancels the draft. Asset
   and entity mentions draw as chips. `CardBodiesTest` covers insertion,
   cancellation and undo. The insert bar now also offers every name a Set
   Variable node publishes, after the node's own inputs and accented as coming
   from the graph, and the composer treats those names as known. Renaming a
   Set Variable node updates the Prompt card. The bar wraps as the web's
   `flexWrap`, so a chip that does not fit moves the Add button to a second
   line. `promptOffersSetVariableNames` and `addVariableAddsDynamicInput` cover
   this. The graph chips use the primary color, where the web uses `info.main`,
   which the canvas theme does not carry.
6. Resize Image in Fit mode now has 256, 512, 768 and 1024 preset chips. A click
   commits both dimensions atomically with one undo entry. A connected dimension
   rejects the entire change. `CardBodiesTest` drives these pointer actions.
7. The Agent content preview starts at y=47, retaining its 217-pixel card height
   and handle centers. Equal-layer overlap follows document order, including
   incremental reorders. `WindowParityTest` covers the fixture overlap.
8. A click on the drop zone selects the card and opens a file picker for its
   media kind. The chosen file uploads and sets the value as a drop does, and a
   cancelled picker changes nothing (`dropZoneClickOpensFilePicker`). Editing a
   slider re-runs nothing, because live previews are scope change SC1.
9. Blur and Resize Image previews are 96 px tall, the `.preview-area`
   `minHeight` in `BlurBody.tsx` and `ResizeImageBody.tsx`, where native drew
   90 px. The Resize Image mode switch follows the body's 2 px gap. The Resize
   Image card is 213 px, 1 px from the web capture. Every preview-area is
   `flex: 1 1 auto`, so an authored taller card now grows the preview and keeps
   the controls at the bottom. `canvasResultBoundsMatchPainterGeometry` changed
   for this reason.
10. Slider thumbs are 12 px with a 2 px ring in the card color. They are
    text.secondary until the value leaves its default and primary after, as
    `AdjustmentSlider` passes `changed`. A bare `NodeSlider`, as on Blur and
    Scale, always passes `changed={false}` and stays neutral
    (`sliderThumbFollowsWebChangedFlag`). Bipolar sliders fill from zero and
    sign positive values.
11. The empty Prompt shows the web placeholder, "Write a prompt… @ to mention
    an asset".

### Bespoke bodies for part 2

[ReactFlowWrapper.tsx](../../../web/src/components/node/ReactFlowWrapper.tsx)
and the bespoke registry in
[bespokeRegistry.ts](../../../web/src/components/node_types/editing/bespokeRegistry.ts)
route node kinds to bespoke bodies. `cardBodyFor` in `CardBodies.cpp` now
routes these, and `CardBodiesTest` asserts their structure, handles and
heights:

| Body | Web source | Native height | Controls |
|---|---|---|---|
| Adjustment, 30 types | `AdjustmentBody.tsx`, `AdjustmentSlider.tsx` | 150 + 28 per slider. Lift Gamma Gain 580 and Split Toning 380 by default. | One 24 px slider per ranged number from metadata, in the 1 fr, 1.4 fr, auto grid. Long labels wrap at 1.3 em. Image properties are handles. |
| Invert, Convert to Grayscale | `SimpleFilterBody.tsx` | 170 | Before and After tabs. |
| Scale | `ScaleBody.tsx` | 170 | 0 to 10 slider shown as `1.00×`. |
| Offset | `OffsetBody.tsx` | 228 | Offset X and Y, then the Wrap toggle. |
| Pad | `PadBody.tsx` | 274 | Fill color and four sliders. |
| Outline | `OutlineBody.tsx` | 226 | Color row and two sliders. |
| Drop Shadow | `DropShadowBody.tsx` | 278 | Color row and four sliders. |
| Color Overlay | `ColorOverlayBody.tsx` | 200 | Color row and one slider. |
| Chroma Key | `ChromaKeyBody.tsx` | 248 | Key color and three sliders. |
| Channels | `ChannelsBody.tsx` | 172 | R, G, B, A and L toggle. |
| Mask | `MaskBody.tsx` | 170 | Img 1, Img 2, Mask and Result tabs, three image handles. |
| HSL Adjust | `HSLAdjustBody.tsx` | 240 | Range select and Hue, Sat and Lum sliders. |
| Generators, 6 types | `GeneratorBody.tsx` | 460 by default, natural 314 for Linear Gradient | Color rows and ranged sliders from metadata. No image handle. |
| Get Variable | `GetVariableBody.tsx` | Follows the wrapped explanation | Explanation, a Variable select of Set Variable names or the empty hint, and the trigger handle. |

The heights are derived from the body CSS and TSX, not from a web capture,
because the parity fixture holds none of these nodes. Each image body is a
96 px preview, 2 px block gaps, its controls block, and 13 px below it: a 2 px
gap before the zero-height outputs row, 2 px body padding, 8 px card padding
and the border. The rule reproduces the measured Blur height of 199 px. Control
rows are 24 px for `AdjustmentSlider`, the compact `NodeSelect` and a quiet
`ToggleGroup`, and 20 px for a bare `NodeSlider` and the `ColorPicker` button.

Sliders, toggles and selects edit their property with one undo step
(`imageBodyControlsEditProperties`). The preview tabs are view state, as the
web's `useState`, and leave the document and undo unchanged. The Get Variable
select opens the inline choice editor with the Set Variable names, and a stored
name without a setter stays selectable
(`getVariableBodyPicksSetVariableNames`). Card captures of every body in both
themes are written by `capturePartTwoCards` to a directory outside the
repository.

Differences in these bodies:

1. A color swatch click selects the card. The web opens a color popover, and
   native edits the color in the inspector.
2. The Before tab and the Mask input tabs show their empty-state message, not
   the upstream image. The canvas painter draws only the node's own result.
3. The Scale dimension badge is not ported.

### Bespoke bodies for part 3

`cardBodyFor` now also routes the node components that `ReactFlowWrapper.tsx`
registers for Compare Images and Constant String, and the Rotate and Flip,
Resize, Fit and Paste bodies. The three provider nodes keep the generic rows
and take the shell additions of `DynamicSchemaNodeShell.tsx`. `CardBodiesTest`
covers each one:

| Body | Web source | Native height | Controls | Test |
|---|---|---|---|---|
| Compare Images | `CompareImagesNode.tsx` | 300×250 minimum, authored sizes grow the comparer | `image_a` and `image_b` handles on the 28 px pitch, and the "Connect two images, then run" empty state filling the padded body | `compareImagesBodyFillsTheCard` |
| Constant String | `ConstantStringNode.tsx` | 106 empty, then 46 plus the wrapped text, at most 600 | Value handle and output on the header line. A click on the text opens the inline editor. Open editor opens it expanded, and Copy copies the value. | `constantStringBodyGrowsWithItsText` |
| Rotate and Flip | `RotateAndFlipBody.tsx` | 202 | A -360 to 360 slider with 90 degree marks and a degree readout, Flip H and Flip V toggles and Reset, which writes all three values in one step | `rotateAndFlipBodyEditsAngleAndFlips` |
| Resize | `ResizeBody.tsx` | 187 | Width and height boxes with the aspect lock | `resizeAndFitBodiesShareTheDimensionRow` |
| Fit | `FitBody.tsx` | 211 | Width and height boxes and the 256 to 1024 presets | `resizeAndFitBodiesShareTheDimensionRow` |
| Paste | `PasteBody.tsx` | 187 | `image` and `paste` handles, and Left and Top boxes | `pasteBodyEditsItsOffsets` |
| FAL, KIE and Replicate | `DynamicSchemaNodeShell.tsx` and the three content files | At least the shell's 120 px content column | The model joins the title, the edge takes the provider color at 25 percent, a hint explains an empty node, and a footer names the provider and model. The Add input and Add output buttons are gone, as on the web. | `dynamicProviderCardsShowTheirModel` |

Each edit is one undo step and keeps unknown node fields. Heights come from the
body CSS, not from a web capture. Resize, Fit and Paste reuse the Resize Image
dimension row, so their boxes follow the measured Resize Image card.

Differences in these bodies:

1. The provider rows keep the generic 8 px card inset, where the shell has no
   body padding. Native has no schema loader, so the header has no reload
   button, and a stored dynamic property also hides the hint, where the web
   reads `dynamic_inputs`, which its loader refetches on load.
2. Constant String's Open editor opens the expanded inline editor, where the
   web opens a modal text editor. A card taller than its text keeps its
   authored height, where the web refits the height when the card mounts.
3. The Paste overlay rectangle and the Resize, Fit and Paste dimension badges
   need upstream image sizes, which the canvas does not read.
4. Compare Images paints the run result with the shared result painter. The
   web's comparer slider is not on the card.

Bodies native still draws with the generic or content card body:

1. Node components: Comfy nodes, Workflow, App and Sketch.
2. Image editing bodies: Canvas Resize, Compositor, Crop, Curves, Levels,
   Masks Extractor and Painter.
3. Other bodies: Collection, Constant Sketch, Constant Timeline, Extract Video
   Frame, List Generator, the synth modules, the audio effects and Audio Output.
4. The Code body (`CodeBody.tsx`), which native shows as a code row.
5. The inline color popover and the upstream images in the Before and Mask
   preview tabs, listed under the part 2 differences above.

### Media values on cards

Before this change an image, video or audio value on a constant or input card
showed only its file name, and an image, video or audio list showed an empty
body. The drop zone row stored the file name and nothing resolved the value:
only run outputs went through `MediaResolver`. The W4 Image Input body was
measured on an empty value, so the gap did not show.

Cards now show the media as `PropertyDropzone.tsx`, the list properties and
`special_nodes.css` do. `CardMediaLoader` resolves each image value through
`MediaResolver`, so asset ids with their `/api/storage` uri, HTTP URLs and
`asset://` references all load, and hands a thumbnail to the model.
`CardMedia.cpp` lays out and paints the zone. Video and audio values play in
`CardMediaPlayer.qml` overlays that `CanvasMediaPresenter` places over the zone,
using the same resolver, `VideoFrameView` and `AudioWaveform` as run outputs.

| Value | Web | Native |
|---|---|---|
| Constant Image or Video | No label, margin or padding. The media fills the card width at its aspect ratio and grows with an authored height. | The same. A video's height follows its decoded frame size, 16:9 until it is known. |
| Image Input | Outlined zone 6 px below the label, padded 4 px, image at most 200 px tall over the alpha checker. The dimensions badge, Copy and Replace show on hover. | The same. Copy puts the full image on the clipboard and Replace opens the file picker. A click elsewhere on a loaded zone does nothing, as on the web. |
| Video Input | The video, then the empty file name line. Native browser controls. | Poster frame, then a bar with play, time and seek. |
| Audio | The file name line, a 15 px waveform, play with time and seek, then loop, mute and download. | The same without download. The zone is 125 px. |
| Lists | A grid of 80 px (image) or 120 px (video) tiles, a column of audio rows, then an 80 px drop zone. | The same grid and heights. Image tiles are painted, video and audio tiles play in one overlay per list. |
| Empty | "Click or drop" zone. An empty constant Video collapses to the header. | "Click or drop" zone, kept for the empty constant Video. |
| Loading and failed | A loading image draws nothing. A failed image reads "Image could not be loaded". | A loading image draws an empty outlined zone at the failed height, 128 px on an input card. A failed image reads "Image could not be loaded". |

Card heights at 280 px match the web DOM to a pixel: constant Image 90 empty,
177 for a 2:1 image; Image Input 120 empty, 128 failed, 284 for a square image;
constant Video 204 and Video Input 273 for a 5:3 video; constant Audio 102
empty and 183 loaded; Audio Input 201; Image List 266 with two images and 156
empty; Video List 256; Audio List 214. The web adds a 98 px recorder below
audio values, which native does not have. `MediaCardsTest` asserts the heights,
the image pixels, the poster frame, playback, the waveform, the hover badge,
the actions, and the empty, loading and failed states against a local server.

Open: the audio and video recorders, audio download, the image viewer on
double click, drops and clicks on a list's drop zone, per-tile remove buttons
and dimension badges, the upstream preview of a connected media input, and the
web's gradient video controls.

### Constant values on cards

Before this change several `nodetool.constant.*` cards showed an empty body or
the wrong control. Model, image size, dataframe, entity, document and model 3D
values had no row. A Select was a free text area. A List or Dict showed a
"Value" label where the web leads with a "Data type" select, and an unset JSON
or string list read "Not set" where the web shows an empty editor or its
prompt. The native catalog fixture for these cards is
[ConstantNodesFixture.json](../tests/ui/ConstantNodesFixture.json), recorded
from the metadata a running server lists, and
[CardBodiesTest](../tests/ui/CardBodiesTest.cpp) asserts each card below with
that metadata.

| Constant | Web | Native |
|---|---|---|
| ASR, Embedding, Image, Language, TTS and Video model | A "Value" label, then the model button with the placeholder of its type, or the model name and provider. | The same chip row. A click opens the shared model picker and one pick is one undo step. |
| Image Size | A label, W and H number boxes, swap, lock and presets buttons, and the matched preset name under them. | The same strip and caption, painted from the web's preset list. A click opens the inspector's size editor over the strip, with W, H, swap, lock and presets. Each change is one undo step and the panel stays open. |
| Select | A dropdown of the node's own `options` with a "Select…" placeholder. | The same dropdown. The options come from the node data and the inspector offers them too. |
| List and Dict | A "Data type" select (int, string, datetime, float), then a table. | A "Data type" field showing the type of the first value, then the existing table summary and row editor. The type is a display only. |
| JSON | A label and an empty editor when unset. | The same. The stored text lives in `data`. |
| Text List | Chips with the prompt "Enter values…". | One line of values with the same prompt. |
| Data Frame | No label. An "Add column" tab, a drop zone with "Drop CSV or Excel file" and "Supported: CSV, XLSX, XLS", then the columns and a table. | The tab, the zone and a read-only text table of the columns and first four rows. Add column is one undo step. A dropped CSV file fills the frame. |
| Script, Sketch, Storyboard and Timeline | A label, a select of documents and a button that opens the document in its editor. | The same layout. The select opens the inspector's document picker. The button asks the window to open the document and does nothing for an empty select. |
| Entity | A label, a chip per picked entity and a "Pick entity" button. | The label and the chip. An unnamed entity reads "Untitled", as on the web. |
| Document | A drop zone without a label. | The zone, reading the file name once set. |
| Model 3D | A label and a drop zone, then the viewer once loaded. | The label and the zone. |

Open: the Data type select does not change how cells edit, the dataframe's
column manager, cell editing and expanded editor, chips and the entity picker,
document names (a stored reference carries no name, so a chosen document reads
"Untitled" until the card learns names from the server), clicking swap, lock
and presets directly on the card, and drops of document and model files onto
their zones.

### Chrome entries without a native panel

These web entries stay visible and disabled in the native rail and status bar. The
tooltip gives the reason. They are gaps, not accepted differences. Building the
panels is outside the chrome work.

| ID | Entry | Web | Native | Status |
|---|---|---|---|---|
| C1 | Rail Projects | Opens the projects list as a tab (`ProjectsRailButton.tsx`). | Disabled. The project menu in the tab strip switches projects. | Open. |
| C2 | Rail Library | Asset grid in the left panel (`PanelLeft.tsx`). | Disabled. | Open. |
| C3 | Rail Entities | Entity library in the left panel. | Disabled. | Open. |
| C4 | Rail Examples | Shipped examples in the left panel. | Disabled. | Open. |
| C5 | Rail More | Favorite nodes, recent nodes, workflow settings, skills and workspace files (`MorePanel.tsx`). | Disabled. Native commands are in the toolbar More menu. | Open. |
| C6 | Rail logo | Opens the app menu with Settings, Help and Downloads (`RailAppMenu.tsx`). | A static logo. | Open. |
| C7 | Rail Documents | Tree of every document in the project. | Opens the workflow browser, which lists workflows only. | Open. |
| C8 | Status Generations | Panel of generations across workflows, with a count of those running. | Disabled. The inspector History tab shows one node. | Open. |
| C9 | Status Workers | Remote runners the server provisions. | Disabled. | Open. |
| C10 | Status Trace | Run trace spans. | Opens the native trace/log dock. | Partial. See [run trace evidence](#run-trace-evidence). |
| C11 | Status Queue | Panel that opens at any time and shows an empty state. | Opens the queue panel only while jobs exist, and disabled otherwise. | Open. |
| C12 | Status connection | Connected, Connecting, Offline or Idle, with a worker label for a remote server and a worker status indicator. | Connected, Offline or Idle. No Connecting state, worker label or indicator. | Open. |
| C13 | Status tab strip | Scroll arrows when the tabs overflow. | No arrows. | Open. |


### Run trace evidence

The status bar Trace entry and More → Run trace open a bottom dock with
`RunTracePanel.qml` and `RunTraceController`. It lists stored runs through the
existing `runs.*` server queries. Run selection, span inspection, failure focus,
log filtering and selection, and raw JSON copy are reachable. The controller
bounds displayed payloads while copying the original JSON. Document and account
changes close the dock and invalidate old responses. Polling runs only while
the panel is visible.

`node_editor_run_trace_tests` drives the real EditorWindow status control, span
and log actions, keyboard run selection, close/reopen, and delayed responses
across document and account changes. Run it offscreen through
`ctest --test-dir <build> -R '^node_editor_run_trace$' --output-on-failure`.
These tests use a fake server. They do not establish live-server or platform
acceptance.

Browser and server spans now have separate virtualized timeline lanes, with
shared source horizons and aligned tracks. Deep labels retain a whole-row
pointer target, and zero-duration endpoint markers remain visible. Home, End
and Enter reach and inspect the last retained span. The lane checks pass, including narrow and wide captures in both themes. Focused trace and
model sanitizer suites also pass serially. See [trace lane design](trace-lanes.md).
Selected spans now show structured metadata, sorted attributes and ordered events
with bounded plain-text values, original JSON copying and independent scrolling.
Wide panels split list and details. Narrow panels retain a visible source header
and selected row above the details. User-triggered Ask agent actions attach full
run and optional span IDs and prepare a draft without sending it. The actual
host signal and deferred context preservation have native tests. The focused trace
and native editor chat suites pass. The complete combined native suite also passes
for these changes. Sanitizer verification runs serially with leak detection disabled.
Logs now use the active view's details pane, with structured attributes and
separate scroll and close state. A remembered span selection no longer occupies
the Logs pane. `RunTraceTest::logsOwnDetailsPane` reproduces that failure and
verifies the correction, literal markup, Ask run/span signals, close/return
behavior and wide/narrow dark/light captures.
See [log details design](trace-log-details.md).

Stored logs use a bounded virtual list with aligned time, level, source, span
and message columns. Narrow panes retain time, level and message. A searchable
span picker matches name and status and shows depth, timing and error context.
All spans clears the query filter. Labels treat stored markup literally.
Tests cover viewport delegate bounds, keyboard tail navigation, selected-row
retention, paging deduplication, filter replacement and actual query inputs.
Dark/light wide/narrow captures cover the list and popup bounds. See
[log list design](trace-log-list-parity.md). Popup content sizing, status pills,
the richer run picker and complete trace visual parity remain open.
See [trace details design](trace-details.md).
