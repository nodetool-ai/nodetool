# Native workflow editor

A standalone C++20 Qt Widgets host uses QtNodes for the graph and
`NodeTool.UiPrimitives` Quick panels for the catalog, toolbar, inspector, and run output.
`WorkflowDocument` owns edits and undo history. Workflow files contain canonical
NodeTool JSON, never QtNodes scene JSON.

## Presentation

The editor follows the web workflow editor's layout, colors, and geometry. A
left rail, workflow tab strip, status bar, and resizable docks frame the canvas.
The floating toolbar and zoom readout are transparent Quick overlays. All panels
share one QML engine and therefore one `Ui.Theme`.

[`EditorScene`](src/graph/EditorScene.h) installs its geometry, node painter,
and connection painter through the QtNodes extension points. It draws the node
card, type-colored handles, inline scalar fields, the canvas grid, and wires.
`wireCurve` is the one curve for wire painting and the hit stroke. QtNodes
computes connection bounds from its own control points, so the bounds margin and
a reverse-offset limit keep the curve inside them. A wire running backward by
more than 1024 logical pixels therefore bends less than React Flow's.

[`node_metrics`](src/graph/NodeLayout.h) and
[`EditorRoles`](qml/EditorRoles.qml) hold the web values scoped to this editor.
`Ui.EditorButton.Outlined` is the web's button style, and `Ui.ListRow` with `flat: true`
is the web's row style. Other native apps keep
the [native design](../ui_primitives/DESIGN.md).

The panels form the `NodeTool.NodeEditor` QML module. No panel reads the editor
window. The panels take small interface objects as required properties, such
as [`NodeCatalog`](src/interfaces/NodeCatalog.h) for the node library and the node menu, and
[`NodeInspector`](src/interfaces/NodeInspector.h) for the inspector, its
property fields and its History tab. The tab bar and the subgraph strips take
[`DocumentTabs`](src/interfaces/DocumentTabs.h), and the tab bar's bell and the
notification list take [`Notifications`](src/interfaces/Notifications.h). The document bar takes
[`WorkflowHeader`](src/interfaces/WorkflowHeader.h), and it and the icon rail
take [`PanelLayout`](src/interfaces/PanelLayout.h). The status bar takes
[`StatusModel`](src/interfaces/StatusModel.h) and `PanelLayout`. The canvas
toolbars and the group controls take
[`EditorCommands`](src/interfaces/EditorCommands.h),
[`Selection`](src/interfaces/Selection.h) and
[`RunState`](src/interfaces/RunState.h). The zoom readout and the mini-map
buttons and popups take [`Viewport`](src/interfaces/Viewport.h). The
first-workflow guide takes
[`FirstWorkflowGuide`](src/interfaces/FirstWorkflowGuide.h).
The workflow browser takes
[`WorkflowBrowser`](src/server/WorkflowBrowser.h), and it and the asset library
take `PanelLayout` and `StatusModel`. The run output takes `PanelLayout`,
`StatusModel` and `RunState`, and the type icons and Markdown output read the
`TypeIcons` and `OutputStyle` singletons.
The canvas chat window takes [`ChatWindow`](src/interfaces/ChatWindow.h) for
its drag and resize.
The queue overlay takes `RunState`, which also carries the run output's runs
and models, and the asset library takes
[`LibraryBrowser`](src/library/LibraryBrowser.h).
The property editors take the media resolver and the pickers from
[`PropertyHost`](src/interfaces/PropertyHost.h), and the media and output views
take the resolver from their parent.
[Component interfaces](docs/component-interfaces.md) tracks which panels still
read a root context property.

## Build and run

Install CMake, a C++20 compiler, Git, and Qt 6.12 with Widgets, QuickWidgets,
Quick, Qml, QuickControls2, Svg, Network, WebSockets, Multimedia, and Test. If Qt is outside
the system prefix, supply `-DCMAKE_PREFIX_PATH=/path/to/Qt/6.12/gcc_64`.

`npm run node-editor` builds the guest bundle when it is missing, builds the
editor in `native/node-editor/build` (`build-windows` on Windows), and starts
it with that bundle. Put editor arguments after `--`, for example
`npm run node-editor -- -- --offline`.
Add `--rebuild-guest` before them to rebuild a stale guest bundle. When no
server answers on `http://localhost:7777`, the script starts the development
server (`npm run dev:server`) there and stops it when the editor quits. The
server log is `server.log` in the build directory. The server uses the
database in the NodeTool data folder, `nodetool/nodetool.sqlite3`, which holds
the assets and workspaces that local runs read. A `DB_PATH` or `DATABASE_URL`
in the shell selects another database. `--no-server`, and the
editor options `--offline`, `--server`, `--screenshot`, `--dump`, `--save` and
`--replay`, skip the server.

```sh
cmake -S native/node-editor -B /tmp/node-editor-build -DCMAKE_BUILD_TYPE=Debug
cmake --build /tmp/node-editor-build --parallel 6
/tmp/node-editor-build/nodetool-node-editor --open workflow.json
ctest --test-dir /tmp/node-editor-build --output-on-failure
```

### Windows

Use the Qt MSVC 2022 kit, Visual Studio's C++ workload, and CMake 3.28 or
newer. The Qt installation must include Multimedia. The
[graph runner dependencies](../graph-runner/README.md#build) are also required.
With vcpkg, enable libvips's `cplusplus`, `jpeg`, `png`, and `webp` features.
Use a shared FFmpeg development distribution and the Windows Wasmtime C API
distribution, including `wasmtime.dll.lib`.

Set `CMAKE_PREFIX_PATH` to the Qt kit, vcpkg's `installed/x64-windows`, and
the FFmpeg prefix, separated by semicolons. Set `PKG_CONFIG_EXECUTABLE` to
the installed pkg-config executable and `WASMTIME_ROOT` to the C API directory.
Configure once from PowerShell:

```powershell
cmake -S native/node-editor -B native/node-editor/build-windows `
  -G "Visual Studio 17 2022" -A x64 `
  "-DCMAKE_PREFIX_PATH=$env:CMAKE_PREFIX_PATH" `
  "-DPKG_CONFIG_EXECUTABLE=$env:PKG_CONFIG_EXECUTABLE" `
  "-DWASMTIME_ROOT=$env:WASMTIME_ROOT"
npm run node-editor
```

The launcher reuses the configured CMake executable and generator, builds
the Release configuration, and starts `Release/nodetool-node-editor.exe`.
The build deploys Qt DLLs, QML plugins, transitive native DLL dependencies,
the compiler runtime, and `guest.js` beside the executable. You can open
`Release/nodetool-node-editor.exe` directly without rebuilding or changing PATH.
Direct launch does not start the backend; use an existing server or offline mode.
The launcher adds the configured
native dependency `bin` directories to its process PATH. Closing the editor
also stops a development server that this launcher started.
The launcher and test script also use the configured Qt plugins, including
the offscreen platform plugin for headless checks.

Local runs accept drive-letter workspace paths. UNC and device-namespace
paths are refused by the filesystem boundary.

CMake fetches [QtNodes](https://github.com/paceholder/nodeeditor/tree/829b18457d4e95ac17f4fdb01c6201125681729d)
at immutable revision `829b18457d4e95ac17f4fdb01c6201125681729d`, under
[BSD-3-Clause](https://github.com/paceholder/nodeeditor/blob/829b18457d4e95ac17f4fdb01c6201125681729d/LICENSE.rst).
That is the first upstream commit with `setNodeGeometry`, and it is unmodified.
A build directory configured against an older revision needs a clean configure.
The adapter uses its `AbstractGraphModel`, `BasicGraphicsScene`,
`AbstractConnectionPainter`, and named-port projection. An existing checkout of that revision can be supplied through
`-DFETCHCONTENT_SOURCE_DIR_QTNODES=/path/to/nodeeditor` for offline builds.
QtNodes supports Qt 5/6. This host requires Qt 6.12 to match the primitives.

## Local runs

The editor links [`native/graph-runner`](../graph-runner/README.md) and loads
its guest bundle in the background at startup. A graph runs inside the editor
process, with or without a server connection, when the runner supports every
node: the core workflow nodes and the nodes the parity suite shows match the
server, as `native/graph-runner/guest/local-nodes.mjs` selects them. Comment
and Group nodes do not count, because the runner drops them as the server does. Other graphs go to the server as before. Local run messages go
through the same session handling as server messages, including the job summary
that puts the run's outputs on the Output panel's job row. Stop cancels a local
run, and the run status text ends with "(local)". The bundle comes from `--guest-bundle <path>`, then
`NODETOOL_GUEST_BUNDLE`, then a `guest.bin` or `guest.js` next to the
executable. Ship the `guest.assets/` directory next to the bundle: fonts,
tokenizer ranks, encoding tables and the node type snapshot load from it. `NODETOOL_LOCAL_RUNNER=0` turns local runs off.

Local runs use the local user's workspace, the folder the server keeps:
`$NODETOOL_WORKSPACES_DIR/1`, otherwise `nodetool/workspaces/1` in
`$XDG_DATA_HOME` (`~/.local/share`) or, on Windows, `%APPDATA%`. They read
`asset://` refs from the server's local asset store: `$ASSET_FOLDER`,
`$STORAGE_PATH`, otherwise `nodetool/assets` in the same data directory. They
may use the GPU, decode media through the native media host, and encode with libx264,
aac, libmp3lame and libopus.

Image outputs of local runs stay in the editor's process
(`src/media/LocalMediaStore.h`): the runner hands each one over as pixels and
run messages carry a `local-media://` URI, which `MediaResolver` resolves
without a server. A card preview scales these pixels directly. A run's images
are released when the session drops the run. Saving one writes a PNG.

`node_editor_slider_preview_profile` measures a card slider drag on
`[Image] → [Color Grade] → [Gaussian Blur]` with a 2560×1440 photo, offscreen.
It prints the time from each slider value to each card image and the main
thread stalls. `--sample <file>` also writes a macOS `sample` call tree of the
drag. The hidden Output panel builds no rows, and the runner keeps the last
two decoded source images, so a preview run does not decode its input again.

```sh
native/node-editor/build/node_editor_slider_preview_profile --seconds 4 --sample /tmp/slider.txt
```

The local runner gets no context operation and no provider endpoint jobs.
[Grants of the in-repo embedders](../graph-runner/README.md#grants-of-the-in-repo-embedders)
lists the callbacks it does get and why each stays synchronous. On exit the
editor destroys its windows, and with the last session the runner, which
cancels its run and joins its worker thread. Then it gives the graph runner's
host lanes 2 s to finish a running native job. If one is still running, the
editor prints a warning and exits with `std::quick_exit`, so static destructors
never run under a live job.

CMake also fetches QuickJS-ng and nlohmann/json for the runner. Supply
`-DFETCHCONTENT_SOURCE_DIR_QUICKJS` and `-DFETCHCONTENT_SOURCE_DIR_NLOHMANN_JSON`
for offline builds. The `node_editor_local_run` test loads
`native/graph-runner/build/guest.js`. Build it first with
`node native/graph-runner/guest/build.mjs`, or point the
`NODETOOL_GUEST_BUNDLE` CMake variable at another bundle.

```sh
/tmp/node-editor-build/nodetool-node-editor --server http://localhost:7777 --workflow FULL_WORKFLOW_ID
```

Authentication reads `NODETOOL_TOKEN` from the environment into the session.
Credentials are not written into a workflow. Server Open and Server Save use
the server session. The bottom status bar's Connect action lets you enter a
server URL (default `http://localhost:7777`) and an optional access token without
restarting. Tokens stay in memory and are never saved in preferences. Remote
authentication requires HTTPS. Connection errors appear in the status bar.
An interactive start connects to `http://localhost:7777` with `NODETOOL_TOKEN`
unless `--server` names another server or `--offline` is given. Screenshot, dump,
save, and replay runs skip this default. Restored tabs that show a server workflow
still reconnect to their own server.
Use More → Reconnect to retry the current server, or Connect to change it.
Connecting and failed connections preserve the current document. Open, the
Workflows rail button, and More → Server Open show the workflow browser. Search
filters loaded pages. Choose a project or load more pages to extend the list.
Create, rename, and delete act on the server. Delete requires confirmation.
Opening a workflow prompts to save, discard, or keep unsaved work. More → Open
file and Save operate on local files. Saving locally uses `QSaveFile`.

## Interaction

Search the Nodes panel or pick a namespace, then click a result or drag it onto
the canvas to add it with metadata defaults. Drag placement follows canvas zoom
and pan. More → Auto layout arranges the graph. More → Layout selection arranges
selected nodes. Both use current card dimensions, fit the result, and undo in one
step. Unsupported documents remain read-only.

Select nodes to show Run selected and Enable/Disable selected in the toolbar.
These actions also appear in More, including on compact canvases. Run selected
submits those nodes and the upstream dependencies that need execution. Live
constant/input values are inlined. Completed upstream generations can be reused,
with signatures and metadata TTLs checking computed values. Saved single pins
and ordered multi-generation selections are honored. A missing generation
blocks an unselected generator, while explicitly selecting it authorizes a new
run. Reusing a generation from an edited generator shows a status notice.
Downstream and unrelated nodes are excluded. Opening a saved server workflow
hydrates its durable generations. The inspector
History tab previews text and media, pins a value or returns to latest, and adds
ordered replay items. Pin/replay edits undo in one step. Missing or deleted pins
remain visible with a recovery message and block reuse. History refresh itself
does not edit the workflow.
Disabled nodes
retain their properties and connections in the document, but are omitted with
attached edges from submitted execution graphs. Enable/disable is one undo step.

More → Instant Update reruns a node and its downstream nodes after each property
edit. Card body controls preview without it when the in-process runner can run
the edited node. A card slider drag reruns each draft value and commits one undo
step on release. A rerun reuses the latest generation of every upstream node, so
in `[image] → [transform a] → [transform b]` an edit of transform b runs only
transform b. A node the runner does not support ends the preview, and the nodes
before it still run. The queue overlay, the Run buttons, the inspector run
controls and each card's running ring show a change only after it holds for
300 ms. A preview run leaves the inspector message as it is, except when it
fails. Cards keep their last result and image until the next run replaces them.

Click a card's text, multiline, numeric, boolean, or choice field to edit it.
A shared-primitives Quick overlay follows the field through canvas zoom, pan,
and resize. Enter commits single-line text and numbers. Ctrl+Enter commits
multiline text. Expand and Collapse keep the draft. Escape cancels it, and
canvas shortcuts stay inactive while typing. Each commit creates one undo step.
Connected inputs and handle-only fields have no inline editor. Clicking back
onto the canvas commits a valid draft before selecting another node. Workflow,
server, and programmatic selection changes invalidate drafts and queued writes.

Select a node to open the inspector's Params, I/O, and Help tabs for the full
metadata-driven property controls. Titles, help, constraints, nullable values, and defaults come
from the property descriptors. Ordinary strings use multiline editing unless metadata requests a single line.
Single-line fields also offer multiline editing. Escape cancels the draft. Each committed field
edit creates one undo step and is bound to its original node. Connected inputs are disabled with an explanation.
Lists, dictionaries, records, and JSON have validated editors where their entry
types are supported. Image/audio/video and generic asset properties offer authenticated library
search, pagination, file upload/drop, progress, cancel/retry, and previews through
the shared media resolver. Selection stores canonical `asset://` references with
full asset IDs. Media lists append, remove, and reorder references while retaining
unknown metadata. File-picker/drop batches append once after all uploads succeed.
A failed batch leaves property references unchanged, and successful uploads remain
in the library. Metadata-declared static append lists stay editable while
connected. Other connected fields remain locked. Model properties open the shared model picker with search, provider
groups, favorites, recents, provider restrictions, and node task filters. Language, embedding, image, video,
TTS, ASR, music, audio-to-audio, rerank, and `hf.*` fields are selectable. Other model types remain preserved
without a selector. Workflow single/list fields offer authorized selection,
loaded-page search, pagination, missing-target checks, and list ordering/removal.
Collection fields select the caller's visible collection names. Existing wrapper
metadata survives selection, undo, and reopen. In the I/O
tab, metadata-enabled dynamic ports can be added, renamed, and deleted. Renaming
updates connected handles. Deleting a connected port also deletes its connections
in the same undo step. Drag named ports to connect matching known
types. Drop a new wire on the canvas or a group backdrop, or click its starting
handle, to search compatible nodes. Arrow keys and Enter choose a node/port,
and Escape cancels. Multiple compatible ports remain explicit choices. Creation
uses metadata defaults and one undoable add-node/add-edge batch. Output starts
place the receiver to the right and align its input with the drop anchor. Input
starts place the producer to the left. Native card geometry and vertical
clearance keep new cards near that anchor. Creation over a group keeps the new
node at the root level. Account, document, metadata, and read-only changes
invalidate the picker. Reconnecting existing edges does not open this creation
picker. Dropping onto an existing card body connects its single compatible port
or opens a port chooser. Scalar inputs replace their previous wire. Typed list
inputs keep existing contributors. Nodes supporting dynamic outputs create an
output first. Dynamic inputs are added when no compatible input exists, except
on schema-only providers. Slot changes, inferred types, exposed handles and the
wire undo together. Invalid cycles leave the graph unchanged.

Unknown nodes retain their JSON and incident named ports. Unsupported
semantics open read-only with the document module's reason in the inspector.

Drag nodes or rubber-band a selection. A pointer gesture commits one document
transaction. QtNodes' scene undo stack is temporary presentation state and is
cleared after a gesture. The host does not install QtNodes' clipboard or undo
actions. Undo and Redo always use the document stack. Delete includes selected
connections. Copy, Paste, and Duplicate use document fragments and remap IDs.

On macOS a two-finger swipe pans, a pinch, Cmd scroll, or physical mouse wheel zooms, and
a left drag box-selects, with no setting. On other platforms More → Canvas navigation selects
Mouse, the default, where the wheel zooms and a left drag pans, or Trackpad, which follows
the macOS scheme. A pinch, the corner readout, and a middle-button drag always work. Fit shows every
node above the floating toolbar, up to 100%, and refits when panels open or close
until you pan, zoom, or move a node. After that, selecting a node keeps the zoom
and scrolls the node into the free canvas area. The toolbar's More menu holds server, clipboard, and fit
actions. Below 1000 logical pixels, the inspector replaces the catalog until it
closes or the window widens. Canvas shortcuts
include Ctrl/Cmd+C/V/Z, platform Redo, Delete, F, Space for Add node, Ctrl+D,
and Ctrl/Cmd+O/S. These accelerators only intercept canvas events, leaving Quick
text fields' editing shortcuts intact. Escape cancels a canvas gesture.
Reconnect restores the transport and reconciles existing run IDs without
resubmitting jobs. Run and Stop delegate to the server. Output opens a resizable bottom panel, initially
collapsed, and appears when a run starts or a session error occurs. Select a run
to inspect text, JSON, node status, and logs. The rail and status bar toggle this panel. Clear history removes completed runs and clears output entries from active runs.
New output continues to appear, and Stop and Reconnect still track active jobs. Typed image, video, and audio outputs resolve through the authenticated session into a private bounded cache. Images preserve their aspect ratio. Video and audio use Qt Multimedia with play, pause, seek, timestamps, volume, and mute. A `QVideoSink` feeds an aspect-preserving painted Quick surface so decoded video also appears in the software scenegraph. Playback starts only after an explicit action. Changing history or server configuration stops playback. Loading and failures appear beside a Retry action. Live node cards show status, progress, streamed text, results, errors, and image previews without changing the workflow or undo history. The rail's theme button switches presentation without changing data.

## Headless use

```sh
QT_QPA_PLATFORM=offscreen QT_QUICK_BACKEND=software \
  /tmp/node-editor-build/nodetool-node-editor \
  --open workflow.json --metadata metadata.json --replay commands.json \
  --dump result.json --screenshot editor.png \
  --select FULL_NODE_ID --theme light
```

`metadata.json` is the node metadata array. `commands.json` is an array of
`WorkflowDocument` commands, with `{"op":"undo"}` and `{"op":"redo"}` also
accepted. Replay exits nonzero on a rejected command. The dump uses canonical
JSON. `--save` exports a workflow and checks write completion. Screenshot mode
waits for initial layout and uses the software Quick renderer. `--select` selects
a node before capture, and `--theme` takes `dark` or `light`.

## Acceptance gaps

Presentation parity is measured per component, not claimed for the whole app. The
[comparison guide](../../docs/native-node-editor-visual-comparison.md#known-deviations)
lists the differences that remain. This is an initial editor, not full web
parity. Specialized subgraph editing, live execution and branch overlays,
grouped history thumbnails and the single-view history pager remain deferred. Existing unsupported data is preserved by the document
module. The inspector provides scalar and supported structured editors, image/audio/video
asset pickers, and model selection. Media recording, crop/trim,
internal library drag payloads, connected upstream-list previews, legacy nested-list
flattening, 3D, llama.cpp, and Transformers.js model fields, provider setup,
and model download/install progress remain unavailable. In-card editing currently
covers scalar properties. Model, media, workflow, collection, list, dictionary,
record, and JSON controls remain in the inspector. See the [parity checklist](docs/parity.md) for supported authoring, browsing, runtime, and media behavior. There is no application menu yet.

Offscreen tests cover QML panel creation, metadata defaults, typed connection
commands, document history, file round trips, and pointer movement as one undo
entry. They do not establish real-platform IME, accessibility, mixed-renderer
input, installed-app behavior, high-DPI behavior, or large-graph frame latency.
Those require separate acceptance.
[CompatibleNodePickerTest](tests/graph/CompatibleNodePickerTest.cpp) checks
filtering, defaults, port choice, placement, undo, and stale popup callbacks.
[CompatiblePickerHostTest](tests/ui/CompatiblePickerHostTest.cpp) drives actual
EditorWindow wire drags and top-level popup clicks, including toolbar stacking
and wheel/padding isolation. Run them with `ctest --test-dir <build> -R
'node_editor_compatible_picker(_host)?$' --output-on-failure`.
`NODETOOL_COMPATIBLE_CAPTURE=/path/prefix` captures that EditorWindow fixture in
both themes. [BodyConnectionTest](tests/graph/BodyConnectionTest.cpp) and
[BodyDropHostTest](tests/ui/BodyDropHostTest.cpp) cover existing-card body matching,
dynamic slots, scalar replacement/list fan-in, rollback and stale active-drag
scope changes. Run them with `ctest --test-dir <build> -R
'node_editor_body_(connection|drop_host)$' --output-on-failure`.
[CatalogTest](tests/ui/CatalogTest.cpp) drives catalog search, keys, the
provider chip and pointer placement. Run it with `ctest --test-dir <build> -R
'node_editor_catalog$' --output-on-failure`. `NODETOOL_CATALOG_CAPTURE_DIR`
writes its captures in both themes.
[NodeMenuComponentTest](tests/ui/NodeMenuComponentTest.cpp) loads `NodeMenu.qml`
with a fixture catalog and no `EditorWindow`, so it links no graph runner,
QtNodes or media. Run it with `ctest --test-dir <build> -R
'node_editor_node_menu_component$' --output-on-failure`.
[InspectorComponentTest](tests/ui/InspectorComponentTest.cpp) loads
`Inspector.qml` with a fixture inspector and no `EditorWindow`, commits a field,
blocks a read-only edit and sends the run and close requests. Run it with
`ctest --test-dir <build> -R 'node_editor_inspector_component$'
--output-on-failure`.
[TabBarComponentTest](tests/ui/TabBarComponentTest.cpp) loads `TabBar.qml`,
`CanvasTabStrip.qml` and `NotificationsPanel.qml` with fixture tabs and
notifications and no `EditorWindow`. It activates, closes, renames and drops
tabs, opens the notifications and copies one. Run it with `ctest --test-dir
<build> -R 'node_editor_tab_bar_component$' --output-on-failure`.
[HeaderRowComponentTest](tests/ui/HeaderRowComponentTest.cpp) loads
`HeaderRow.qml`, `Rail.qml` and `StatusBar.qml` with fixture interfaces and no
`EditorWindow`.
Run it with `ctest --test-dir <build> -R 'node_editor_header_row_component$'
--output-on-failure`.
Complete successful-reconnect acceptance, inferred Code ports, dedicated canvas
add-variable targets, full Agent-control presentation, value/code convenience
actions remain outside these subsets.
[NodeCreation](src/graph/NodeCreation.h) shares metadata defaults, property
overrides, unique input names, rich-preview and bespoke creation sizes, optional
model pins, and palette Concat starters across creation entry points. The
output-side picker also applies receiving-name and metadata-style rules.
[NodeCreationTest](tests/graph/NodeCreationTest.cpp) checks this policy and
canonical undo. Run `ctest --test-dir <build> -R 'node_editor_creation$'
--output-on-failure`. User-script/snippet materialization, the virtual AI code
entry, and native model-preference persistence remain open.
[InlinePropertyTest](tests/graph/InlinePropertyTest.cpp) drives real card mouse
activation and Quick typing, popup choice navigation, expansion, range
validation, shortcut isolation, and viewport alignment. Its optional
`NODETOOL_INLINE_CAPTURE=/path/prefix` writes dark/light fixture screenshots.
[InlineHostTest](tests/ui/InlineHostTest.cpp) checks actual EditorWindow click,
commit, undo, and credential-change rejection. Fixture captures do not establish
EditorWindow visual parity. Run both with `ctest --test-dir <build> -R
'node_editor_inline_(property|host)' --output-on-failure`.
A separate synthetic test projects 1,000 nodes
and 2,000 edges and checks their adjacency, without measuring input-to-paint
latency. No performance target is claimed.

## Live backend verification

The separate live test creates a workflow on the supplied backend, edits and
reopens it, checks a stale-save conflict, and runs `nodetool.text.Concat`. Use a
disposable backend because the workflow remains stored after the test.

```sh
cmake -S native/node-editor/tests/live -B /tmp/node-editor-live \
  -DCMAKE_PREFIX_PATH=/path/to/Qt/6.12/gcc_64
cmake --build /tmp/node-editor-live --parallel 2
NODETOOL_LIVE_URL=http://127.0.0.1:7777 \
  ctest --test-dir /tmp/node-editor-live --output-on-failure
```

An authenticated backend also needs `NODETOOL_TOKEN`. Missing backend
configuration fails the test. This test exercises the native server session.
Host-level identity and local-path behavior are covered by the UI tests.

## Compare presentation with the web editor

The [visual comparison harness](../../docs/native-node-editor-visual-comparison.md)
captures matching production controls and graph elements in both themes. Its
report compares colors, borders, typography, and spacing and links each case
to its owning source. Differences are diagnostic until explicitly checked.

Offscreen UI tests cover the node card geometry, wire and grid painting, shell
panel state, shared theme changes, catalog filtering, and the narrow layout.

## Property picker verification

[AssetPickerTest](tests/models/AssetPickerTest.cpp) checks authenticated library
search, pagination, streaming multipart upload, failure/cancellation,
QML dispatch, connected/read-only controls, stale node/server isolation,
canonical full-ID references, undo, and reopen.
[ModelPickerTest](tests/models/ModelPickerTest.cpp) checks authenticated catalog
queries, provider and task filters, typed values per model family, cancellation, undo, and reopen.

Run `ctest --test-dir <build> -R 'node_editor_(models|asset_picker)'
--output-on-failure` after building the native host. The fixtures run without
npm or live providers. They do not establish platform file-dialog acceptance,
cross-window desktop drops, or live-provider availability.

[ResourcePickerTest](tests/models/ResourcePickerTest.cpp) checks workflow
single/list selection and collection names against deterministic authenticated
HTTP fixtures. It covers workflow pagination and missing targets, ordered list
changes, preserved wrapper metadata, empty/error responses, cancellation, undo,
and reopen. Run `ctest --test-dir <build> -R node_editor_resource_picker
--output-on-failure`. Tool lists, folder/document/entity selectors, and
document-specific create/open flows remain unavailable.

[PropertyPickerHostTest](tests/models/PropertyPickerHostTest.cpp) renders populated
media-list and generic-asset inspectors in dark/light and wide/narrow layouts.
Set `NODETOOL_PROPERTY_CAPTURE_DIR` and run
`node_editor_property_picker_host_tests` to save its captures. Focused picker
tests also check ordered batch upload, failure without reference changes,
metadata-preserving list operations, generic file MIME handling, and cancellation
after replacing a workflow with the same node IDs.

[PresentationPropertyTest](tests/models/PresentationPropertyTest.cpp) verifies
color and image-size values, custom controls, canceled/invalid drafts, metadata
defaults, connected descriptors, undo, and reopen. It also checks the mirrored
preset data against the web source. The host property test exercises real
keyboard commits and dark/light wide/narrow captures. Font, media-parameter,
file/path, and folder-path editors remain unavailable, as do the web color
modal's saved swatches/history, harmony/contrast tools, eyedropper, and gradients.

Inspector field delegates persist across value updates. Their identity and
workflow/credential epochs cancel stale drafts and queued commands when the
scope changes, including when conditional fields replace a same-kind slot.
Image-size ratio lock survives ordinary dimension commits.
