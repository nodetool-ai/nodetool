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
card, type-colored handles, inline value previews, the canvas grid, and wires.
`wireCurve` is the one curve for wire painting and the hit stroke. QtNodes
computes connection bounds from its own control points, so the bounds margin and
a reverse-offset limit keep the curve inside them. A wire running backward by
more than 1024 logical pixels therefore bends less than React Flow's.

[`node_metrics`](src/graph/NodeLayout.h) and
[`EditorRoles`](qml/EditorRoles.qml) hold the web values scoped to this editor.
`NodeButton` and `PanelRow` are editor controls for the web's button and row
styles. Other native apps keep the [native design](../ui_primitives/DESIGN.md).

## Build and run

Install CMake, a C++20 compiler, Git, and Qt 6.12 with Widgets, QuickWidgets,
Quick, Qml, QuickControls2, Svg, Network, WebSockets, Multimedia, and Test. If Qt is outside
the system prefix, supply `-DCMAKE_PREFIX_PATH=/path/to/Qt/6.12/gcc_64`.

```sh
cmake -S native/node-editor -B /tmp/node-editor-build -DCMAKE_BUILD_TYPE=Debug
cmake --build /tmp/node-editor-build --parallel 6
/tmp/node-editor-build/nodetool-node-editor --open workflow.json
ctest --test-dir /tmp/node-editor-build --output-on-failure
```

CMake fetches [QtNodes](https://github.com/paceholder/nodeeditor/tree/829b18457d4e95ac17f4fdb01c6201125681729d)
at immutable revision `829b18457d4e95ac17f4fdb01c6201125681729d`, under
[BSD-3-Clause](https://github.com/paceholder/nodeeditor/blob/829b18457d4e95ac17f4fdb01c6201125681729d/LICENSE.rst).
That is the first upstream commit with `setNodeGeometry`, and it is unmodified.
A build directory configured against an older revision needs a clean configure.
The adapter uses its `AbstractGraphModel`, `BasicGraphicsScene`,
`AbstractConnectionPainter`, and named-port projection. An existing checkout of that revision can be supplied through
`-DFETCHCONTENT_SOURCE_DIR_QTNODES=/path/to/nodeeditor` for offline builds.
QtNodes supports Qt 5/6. This host requires Qt 6.12 to match the primitives.

```sh
/tmp/node-editor-build/nodetool-node-editor --server http://localhost:7777 --workflow FULL_WORKFLOW_ID
```

Authentication reads `NODETOOL_TOKEN` from the environment into the session.
Credentials are not written into a workflow. Server Open and Server Save use
the server session. The bottom status bar's Connect action lets you enter a
server URL (default `http://localhost:7777`) and an optional access token without
restarting. Tokens stay in memory and are never saved in preferences. Remote
authentication requires HTTPS. Connection errors appear in the status bar.
Use More → Reconnect to retry the current server, or Connect to change it.
Connecting and failed connections preserve the current document. More → Server
Open and Server Save load and save server workflows. Open and Save operate on local files. Opening dirty work
prompts for save, discard, or cancel. Saving locally uses `QSaveFile`.

## Interaction

Search the Nodes panel or pick a namespace, then click a result to add it with
metadata defaults. Canvas fields are read-only previews. Select a node to open
the inspector's Params, I/O, and Help tabs and edit metadata-driven text, multiline, numeric, boolean, and
choice properties. Titles, help, constraints, nullable values, and defaults come
from the property descriptors. Ordinary strings use multiline editing unless metadata requests a single line.
Single-line fields also offer multiline editing. Escape cancels the draft. Each committed field
edit creates one undo step and is bound to its original node. Connected inputs are disabled with an explanation.
Structured values remain visible and preserved without an editor. Drag named ports to connect matching known
types. Unknown nodes retain their JSON and incident named ports. Unsupported
semantics open read-only with the document module's reason in the inspector.

Drag nodes or rubber-band a selection. A pointer gesture commits one document
transaction. QtNodes' scene undo stack is temporary presentation state and is
cleared after a gesture. The host does not install QtNodes' clipboard or undo
actions. Undo and Redo always use the document stack. Delete includes selected
connections. Copy, Paste, and Duplicate use document fragments and remap IDs.

Wheel or the corner readout zooms and middle-button drag pans. Fit shows every
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
parity. Dynamic-port editing, groups,
comments, subgraphs, reroutes, lineage visualization, auto layout, partial runs,
compatible-node picking from loose connections, rich model selectors, remain deferred. Existing unsupported data is preserved by the document
module. The inspector uses metadata-specific scalar widgets. Structured JSON, media,
and model values remain read-only until dedicated validated editors exist. See the [parity checklist](docs/parity.md) for supported runtime and media behavior. Server connection configuration currently uses CLI
arguments. There is no application menu yet.

Offscreen tests cover QML panel creation, metadata defaults, typed connection
commands, document history, file round trips, and pointer movement as one undo
entry. They do not establish real-platform IME, accessibility, mixed-renderer
input, installed-app behavior, high-DPI behavior, or large-graph frame latency.
Those require separate acceptance. A separate synthetic test projects 1,000 nodes
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
