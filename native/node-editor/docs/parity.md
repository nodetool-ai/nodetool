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
  audio-to-audio, rerank, and `hf.*` fields: search, provider groups, favorites, recents,
  web-matching provider restrictions and node task filters, TTS voice selection,
  missing-key and missing-model feedback, and typed selection with one-step undo.
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
- Modal asset-viewer behavior, copy, multiselect/compare, batch download and
  Save to assets actions. Mixed collections use native gallery tiles instead of
  every specialized web array renderer.
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

This is a partial F02 implementation. Workflow JSON creation/navigation,
example installation/graph fragments, sketch/timeline/storyboard/chat-media
payloads, Electron's in-place `file://` mode, directory imports and operating
system cross-application drag acceptance remain unverified or unsupported.

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

Remaining connection flows include dedicated canvas add-variable drop targets, full Agent-control
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
--output-on-failure`. Custom user-script and snippet materialization, the virtual
AI code entry, and persisted native model preferences remain separate flows.

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

This remains a gallery subset. Selection opens inline, while the web ImageView
and PreviewImageGrid can open modal AssetViewer galleries. The native panel
preserves mixed text alongside media, including arrays that the web
image-specific AssetGrid filters to images. Audio/video/text collections use
native gallery tiles rather than every specialized web array renderer. Copy,
multiselect/compare, batch download, Save to assets and other web output quick
actions remain pending. Selected media reuse the authenticated resolver and
download controls. Offscreen tests do not establish platform accessibility or
fractional-DPI rendering acceptance.

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
| shortcuts.ts `toggleNodeCollapsed` | Collapse / expand node: `["C"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `selectConnectedAll` | Select Connected (All): `["Shift", "C"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `selectConnectedInputs` | Select Connected (Inputs): `["Shift", "I"]` | Open: no matching binding in the native shortcut registry. |
| shortcuts.ts `selectConnectedOutputs` | Select Connected (Outputs): `["Shift", "ArrowLeft"]` | Open: no matching binding in the native shortcut registry. |
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

Color-mode settings, the category legend, animated transitions and exact
React Flow mask/drag geometry remain open. Port-label toggling is not exposed
by the native host. Offscreen tests do not verify real-desktop input,
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
authenticated media resolver. The comparison overlays the images with a draggable
wipe in horizontal and vertical modes. Switching modes resets the divider.
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
rather than loading omitted rows. Image comparison does not show image metadata.
Tool headers still use a flat button instead of the web
badge structure, and arguments have no syntax highlighting. Markdown links and
code blocks retain Qt styling rather than the web styling. Plotly exposes configuration and data instead of a chart.
Streaming PCM has Start, Stop and Restart controls backed by a bounded native playback buffer.
URI-only text references are not fetched. Qt Markdown does not reproduce web
reasoning toggles or all web Markdown extensions. Structured values use bounded
JSON rather than recursive specialized renderers. Image comparisons have labeled
previews rather than the web draggable comparison modes. Complete chunk-array dispatch remains separate acceptance work. These fixtures do not
verify live server streaming or physical audio output.

### F14 verification limits

`MenusTest.cpp` drives command search, disabled-command Enter, Escape, pane/card/selection context events, account replacement, read-only enablement and vertical duplication through EditorWindow. Help merges alternate keys into one row per command from the binding table. The inventory check rejects mapped shortcut rows without a native binding. A deliberately invalid mapped row failed that check before restoration. The command and help surfaces use grouped, searchable Quick panels and shared primitives. Context menus retain Qt Widgets presentation. Web help also has a physical keyboard visualization and platform/layout/category controls that the native panel does not reproduce.

The shortcut inventory includes surrounding web panels and asset shortcuts. Those remain open when their native surface or binding is absent. Native nudge arrows and Escape appear in help alongside the table-driven accelerators. Escape cancels the canvas gesture rather than stopping a run. The web find result navigator remains open.


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


### F31 streaming PCM evidence

The output panel recognizes audio chunks and decodes base64 PCM little-endian
integer and float payloads with sample-rate and interleaved-channel metadata.
`src/media/PcmStream` separates bounded replay storage from the push-mode
QAudioSink device. Full buffers refuse additional audio with a visible notice.
Device backpressure retains unwritten bytes, and an empty queue waits for new
chunks. Missing devices and unsupported device formats produce a visible state.
Run selection, new runs, workflow replacement and account replacement stop and
clear playback through the run-output reset boundary. Old scopes and duplicate
job sequences cannot add audio to the selected stream.

`tests/media/PcmStreamTest.cpp` covers byte order, metadata validation, malformed
frames, buffer refusal, device backpressure, restart position, stop, missing
devices and stale scopes. `tests/ui/RichOutputHostTest.cpp` drives Start, Stop
and Restart through pointer events in EditorWindow and checks unchanged document
and undo state. The dark and light PCM panel captures were opened at full size.
Physical audio output and live server delivery remain unverified offscreen.
The native control has a status label instead of the web live visualizer and
queue-position display. Devices that cannot play the source format show an
unsupported-format state rather than resampling. Replay is limited to retained
audio in the selected run, and simultaneous node streams share that run's player.


### F37 workflow versions, sharing and metadata

**Version history**, **Share workflow** and **Workflow metadata** are available
from More and the command menu. [WorkflowVersions](../src/server/WorkflowVersions.cpp)
uses the authenticated workflow tRPC endpoints. Local files without an explicit
server binding show an unavailable state. Credential changes and document
replacement invalidate pending requests and close the panels.

[VersionHistoryPanel](../qml/VersionHistoryPanel.qml) opens in the bottom dock,
where the web hosts history. Opening history hides the output dock so history
can use the bottom area's width. Rows show a graph thumbnail, version number,
save type, timestamp, serialized graph size and description. Selected rows expose
restore and delete actions. Comparison targets have a separate selected state.
Deletion asks for confirmation and uses the authenticated version endpoint.

[VersionGraphPreview](../qml/VersionGraphPreview.qml) draws the inspected
snapshot without loading it into the editable document. Inspection and comparison
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

Sharing lists owner-visible links and collaborators. The panel creates viewer,
editor and public links, exposes copyable URLs, revokes links, changes roles and
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
[WorkflowVersionsHostTest](../tests/ui/WorkflowVersionsHostTest.cpp) uses real
pointer events through EditorWindow for version selection, saved-version comparison,
dirty protection, restore, toolbar undo, canceled and confirmed deletion, sharing failure and link creation, and metadata rename persistence.
`NODETOOL_VERSIONS_CAPTURE_DIR` enables dark and light captures without
assuming an output directory. History captures include the actual EditorWindow,
with the canvas, history list, preview, comparison and dirty-work warning.
The history images were opened at full size for visual inspection. Sharing
and metadata retain their separate dialog captures.

Native metadata fields commit on editing completion rather than the web's
text debounce. Workspace selection uses an ID field instead of a workspace
picker, and tags use a comma-separated field instead of suggestions. Version
checkpoint creation remains outside these native panels. The native preview uses
simple labeled node rectangles and straight connections without the web's full
node renderers, property widgets, group styling, pan or zoom. Rows show full
timestamps rather than relative times and expose actions on selection rather than
hover. Diff properties remain expanded rather than using web accordions.
Comparison follows the explicitly labeled target-to-selection direction rather
than sorting the versions chronologically. Sharing uses copyable text rather
than a dedicated copy action and does not verify link redemption. Live server
verification and browser redemption of share links remain unverified.

Run the focused targets with the configured native build directory:

```sh
cmake --build "$NODE_EDITOR_BUILD_DIR" --target node_editor_versions_tests node_editor_versions_host_tests --parallel 3
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software "$NODE_EDITOR_BUILD_DIR/node_editor_versions_tests"
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software "$NODE_EDITOR_BUILD_DIR/node_editor_versions_host_tests"
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

[The tab strip](../qml/TabBar.qml) opens blank documents, switches documents,
shows unsaved markers and closes documents. Dirty close offers Save, Discard and
Cancel. A canceled chooser or failed save leaves the tab open. Server saves must
acknowledge the current draft before a requested tab close can finish. Opening
an already-open server workflow selects its tab, including during its initial
fetch. The Open file action also selects already-open local paths.

Accepted window closure stores open local paths, server workflow identities and
the active tab in QSettings. Startup restores those references. Tokens and
unsaved snapshots are not stored. Unnamed local tabs restart blank. Server
restoration uses the configured environment token. Selection, viewport and undo
history persist during tab switches, rather than across process restarts.

[WorkflowTabsTest](../tests/ui/WorkflowTabsTest.cpp) drives actual tab buttons,
canvas drags and close-dialog buttons through EditorWindow. It checks separate
undo histories, cancel and local-save closure, background run output over
MsgPack WebSocket, destroyed-session completion isolation, a delayed upload
crossing tab closure, open-document restoration and duplicate server opens.
The large-graph case checks graph and item identity, selection, viewport,
document changes and model-reset signals while switching. Set
`NODETOOL_TABS_CAPTURE_DIR` to capture dark and light editor images. Run:

```sh
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software ctest --test-dir <build> --output-on-failure -R '^node_editor_(workflow_tabs|ui|canvas_authoring|autosave_host|server_sync_host|menus)$'
```

The web stores tab references as workspace state and offers discard confirmation
when closing dirty documents. Native adds the explicit Save choice and creates
a blank workflow after the last tab closes. Native does not implement tab
reordering, project-grouped tab sessions, tab context menus or running badges.
Child canvases and linked workflow navigation are described below.


## First-use and dependency setup

The guide waits for `workflows.list({ limit: 1 })` and appears only when the
saved list is empty. Disconnected editors and unresolved lists hide it. Account
changes invalidate pending responses. The guide offers the String Input → Output
starter, choosing nodes, and server workflow templates. Starter creation is an explicit, atomic document edit. Starting or choosing nodes
keeps the guide visible with the five readiness items. Closing dismisses it for
the current document. Readiness follows
`web/src/components/node/reactFlowGraphModel.ts:firstWorkflowReadiness`: exact
starter node types, a directed edge between them, both nodes with a clean document,
and any completed run.
The catalog also opens the runtimes and packs dialog for existing workflows.
Missing metadata remains visible on its card. Missing runtime warnings use the
server's runtime status response. Catalog refresh changes presentation metadata,
without rewriting stored nodes, edges, properties, positions or undo history.

`tests/ui/SetupHostTest.cpp`, registered as `node_editor_setup_host`, sends real
pointer events through EditorWindow and its nested tab hosts. Its local fake
server exercises starter and template actions, unknown metadata, runtime warnings,
pack progress, failure, retry, cancellation, account replacement and tab closure.
It checks unchanged graph JSON and undo history after metadata disappears and
returns. Capture output is enabled only by `NODETOOL_SETUP_CAPTURE_DIR`.
The dark and light empty-canvas captures were opened at original resolution and
inspected for readable text, visible actions and unclipped layout.

Pack enabling calls `packs.setBuiltinEnabled` and reloads the node catalog on
success. It requires an explicit click. Cancel invalidates the local response
rather than claiming to stop work already accepted by the server. Account changes
clear the dependency scope. Closed tabs destroy the request owner.

Runtime installation remains unavailable in this native host. The server router
at `packages/websocket/src/trpc/routers/packs.ts` exposes `runtimeStatuses`,
`setBuiltinEnabled` and `reload`, but no runtime install or cancellation procedure.
The web installer calls Electron's `window.api.packages.installRuntime`, handled
in `electron/src/ipc.ts`. The native dialog explains installation on the server
machine rather than issuing an invented install request.

Pack enabling is explicit rather than
the web hook's automatic enabling for configured keys or loaded builtin nodes.
Template browsing uses `workflows.examples` inside the native dialog. Its list
contains empty graph placeholders. Selection calls `workflows.create` with the
example seed reference and package, then opens the created server workflow.
External pack download/installation is not provided by the referenced server
router. The tested pack operation enables a builtin already shipped on the server.


### F24 run queue

`WorkflowSession` exposes its own submitted jobs to `QueueOverlay.qml`. Jobs
remain scoped to the tab that submitted them. Switching credentials clears the
queue, and closing the tab destroys its session and pending callbacks. Unknown
job events cannot create queue entries. Run remains available during execution
and submits a distinct job. Stop and Remove use the existing `cancel_job`
WebSocket command and wait for the server's terminal event. Disconnected buttons
cannot submit or cancel. An uncertain run must be reconciled before resubmission.

The queue starts collapsed with a status dot, one run name or a running count,
an elapsed clock, an expand control and queued count. Expanded content groups
Running, Enqueued and Cancelled cards. Completed and failed jobs stay in output
history rather than the overlay. Cancelled jobs alone do not keep it visible.
Running cards select the output lens only for the current workflow, using pointer,
Enter or Space activation. The selected card shows On canvas. Pinned canvas
focus remains different from the web store.

The overlay is 304 logical pixels wide at the canvas leading margin, beyond the
native rail and catalog. Its height stops above the floating toolbar. Narrow
canvases constrain its width to keep controls inside the viewport. Enter and exit
use the primitive normal motion duration with retained exit content. Reduced
motion removes transitions and progress animation. Elapsed clocks use server
`started_at` when available, otherwise the locally observed running time. The
one-second timer stops when no live job runs.

`QueueUiTest.cpp` uses pointer and keyboard events against QML and deterministic
MsgPack events through EditorWindow. `NODETOOL_QUEUE_CAPTURE_DIR` enables dark
and light captures at wide and narrow sizes, in both expansion states. F24 remains
partial pending visual acceptance and pinned canvas focus parity.

More includes Instant Update. Native property commits run the changed node and
its downstream targets through the partial-run planner when connected and idle.
The web also debounces preview changes in
`web/src/hooks/nodes/useInputNodeAutoRun.ts`. Native drafts stay local until
commit in `EditorWindow::commitProperty`. Job discovery and cancellation
transport are tracked separately from overlay presentation.


## F09 child graphs and derived ports

[ChildPorts](../src/document/ChildPorts.cpp) reads inline subgraphs and stored
workflow/app snapshots. It uses the web input/output type mappings, metadata
input types, named custom inputs, nested ReactFlow properties, title fallbacks,
app constants, variable defaults and streamed output correlation. Projection
keeps unknown incident handles without rewriting imported JSON.

[EditorTabs](../src/ui/EditorTabs.cpp) opens child canvases from the selection
bar, double-click, More or the command menu. Tab labels show the parent and
child. Each child has its own document and undo stack. Inline edits write back
to the owning node. Returning after parent undo reloads the stored child graph
and resets stale child history. Closing a parent closes its inline descendants.
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
and delayed responses after tab closure or account replacement. Set
`NODETOOL_SUBGRAPH_CAPTURE_DIR` for dark and light host captures. Run with:

```sh
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software ctest --test-dir <build> --output-on-failure -R '^node_editor_(subgraph|workflow_tabs|ui|menus)$'
```

Native child canvases use the document strip with parent labels rather than the
web's recursive strip within a workspace tab. Child writes are committed with
each document command rather than a debounce. App and workflow choice currently
uses the existing node properties and saved snapshots rather than the web's
specialized selection controls. The linked-workflows menu lists workflow/app
nodes in the current graph rather than a mini app document's operation bindings.
