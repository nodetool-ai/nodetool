# Node editor canvas on Qt Quick

This plan ports the canvas of the
[native node editor](../../../native/node-editor/README.md) from QtNodes, a
`QGraphicsView` canvas with `QQuickWidget` overlays, to Qt Quick. The editor
then has one `QQuickWindow` and one scene graph. Cards, ports, edges, overlays
and panels are Quick items, and the window renders through Qt's RHI. The
editor can then host the timeline's `PreviewCompositor`, a `QQuickRhiItem`,
directly.

The plan comes from a read-only study of the editor, of QtNodes at the pinned
commit `829b18457d4e95ac17f4fdb01c6201125681729d`, and of the RHI spike logs.
Nothing in it was built or run. The items the study could not confirm are in
[Unverified](#unverified).

## Why

The user decided the port on 2026-11-18, after a spike ran the current editor
on RHI. The spike logs are `~/.cache/tp-native/logs/ne-rhi-*.log`.

- Under RHI, the masked `WA_AlwaysStackOnTop` media previews of
  `CanvasMediaPresenter` draw over the cards above them, the chat panel and
  the inline note editor, on Vulkan and OpenGL. Translucent overlays without
  stack-on-top leave black holes. `window.grab()` shows neither defect.
- `QQuickWidget` takes the `QRhi` of the top-level backing store
  (`QQuickWidgetPrivate::initializeWithRhi`, Qt 6.12). No graphics
  configuration or device can be set, so VAAPI DMA-BUF import and D3D11
  `VIDEO_SUPPORT` are out of reach.
- A failed GPU device gives a black window. Under
  `QT_QPA_PLATFORM=offscreen`, Qt falls back to software without a message.
- A `QQuickRhiItem` does render inside a `QQuickWidget` under Vulkan and
  OpenGL.
- The canvas paints with QPainter in both modes, so RHI gains it nothing
  today.

## Decisions before work starts

The user accepted D1 to D9 as recommended and deferred Q11 until edges are
measured on RHI after Q10.

On 2026-11-19 the user decided that the Quick canvas is the default and that
QtNodes is removed. Q5 therefore flips the default without a one-release
fallback, and Q6 deletes QtNodes in the same PR series. Q4 comes first
because the media, inline editor and picker overlays still live in widgets.

- **D1. Keep `QtNodes::AbstractGraphModel` as the model interface.**
  Recommended: keep it. `WorkflowGraphModel` implements it, and 28 source
  files and 61 test files use `QtNodes::NodeId`, `PortType`, `PortIndex` and
  `ConnectionId`. The model headers need only Qt Core. While both canvases
  exist, both use the fetched headers. When QtNodes leaves (Q6), five files
  are vendored unmodified and keep the `QtNodes` namespace. The alternative, a
  new model interface, renames about 600 uses and changes no behaviour.
- **D2. How cards draw.** Three options:
  - O1: a C++ `QQuickItem` per card that shows a texture. The existing
    QPainter card painter fills the texture. Recommended.
  - O2: C++ scene graph nodes (rectangles, glyph nodes, custom materials) per
    card element.
  - O3: a QML delegate per card.

  O1 keeps `NodeLayout`, `CardBodies`, `CardBodyPainter` and `CardControls`
  (about 4,700 lines) and the pixel tests behind them. Pan, zoom and card
  drag become transforms of existing textures. O2 and O3 rewrite those lines
  and reopen the parity contract. O3 also puts a QML context and bindings
  behind each of 2,000 cards.
- **D3. How edges draw.** Recommended: two paths in one item class. The
  painted path (the existing `WirePainter` into a texture) arrives first and
  stays as the path for the software backend. A geometry node with a dash
  shader is added in Q11 for RHI. The flow animation scrolls dashes at 120
  pixels a second, so a painted edge re-rasters on every frame of a run. The
  shader path changes one uniform. Decide whether Q11 is in scope.
- **D4. How a large graph stays fast.** Recommended: one C++ item per node
  and per edge with no QML delegate, a grid index for hit tests and culling,
  textures only for cards near the viewport, and a raster budget per frame.
  Numbers are in [Large graphs](#large-graphs).
- **D5. No usable GPU device.** Recommended: the canvas uses only scene graph
  nodes that the software backend can draw, so the whole editor works on
  `QT_QUICK_BACKEND=software`. At start, the editor probes the RHI backend.
  If the probe fails, it selects the software backend and shows a notice. If
  the scene graph fails later (`QQuickWindow::sceneGraphError`), the editor
  relaunches itself with the software backend. On the software backend the
  timeline player reports `status: unavailable`.
- **D6. How tests run offscreen.** Recommended: logic tests keep
  `QT_QPA_PLATFORM=offscreen;QT_QUICK_BACKEND=software`, as all 91 ctest
  entries set today. A new `render` label holds the tests that need a device.
  They run on lavapipe Vulkan under `xvfb`, as the timeline's render tests do.
- **D7. How far Qt Widgets leaves.** Recommended: `QMainWindow`,
  `QDockWidget`, `QStackedWidget`, `QGraphicsView` and every `QQuickWidget`
  leave. `QApplication` stays, so that the 45 uses of `QFileDialog`,
  `QMessageBox` and similar dialogs keep working. Moving those to
  `QtQuick.Dialogs` is a later, separate change.
- **D8. Order against the timeline player plan.** See
  [The timeline player plan](#the-timeline-player-plan). Recommended: the
  timeline plan's S0 to S4 and S6 continue now. This plan runs in parallel up
  to Q9. S5 shrinks and S7 lands after Q10.
- **D9. RHI inside `QQuickWidget` as an early step.** After Q6, no
  `QQuickWidget` overlaps the canvas, so the app could switch to RHI before
  the shell port. The timeline player would then render in the editor with
  software decode. Recommended: do not. The black window on a failed device
  and the missing device configuration remain until Q10.

## Findings

- **F1. QtNodes supplies less than its class list suggests.** The editor uses
  a plain `QGraphicsView`, not `QtNodes::GraphicsView`
  ([`EditorWindow.cpp`](../../../native/node-editor/src/ui/EditorWindow.cpp),
  line 544), and its own zoom, pan and fit code
  ([`EditorViewport.cpp`](../../../native/node-editor/src/ui/EditorViewport.cpp)).
  Undo belongs to `WorkflowDocument`. The editor clears the QtNodes undo
  stack after each gesture (`scene_->undoStack().clear()`, line 4314). What
  the editor takes from QtNodes is the model interface, the item maps of
  `BasicGraphicsScene`, the item mouse handlers, the draft connection, and
  `NodeConnectionInteraction`. These are about 1,600 lines upstream.
- **F2. The editor's own canvas code is the larger part.**
  [`EditorScene.cpp`](../../../native/node-editor/src/graph/EditorScene.cpp)
  has 2,801 lines. It holds the geometry (`NodeGeometry`, line 85), the card
  painter (`NodePainter`, line 325), the wire painter (`WirePainter`, line
  863), and about 1,700 lines of mouse and key handling written against
  `QGraphicsSceneMouseEvent`.
- **F3. Card content is already independent of QtNodes.**
  `NodeLayout.h`, `CardBodies`, `CardBodyPainter` and `CardControls` include
  no QtNodes view class. They use QPainter and the model.
- **F4. Seven classes hold a `QGraphicsView&`.** `CanvasMediaPresenter`,
  `InlinePropertyPresenter`, `InlineTitlePresenter`, `CompatibleNodePicker`,
  `CanvasDropController`,
  [`MiniMap`](../../../native/node-editor/src/ui/MiniMap.h) (a `QWidget`
  child of the view) and `EditorWindow`. `EditorWindow.cpp` alone has 106
  uses of scene and view calls. `LineageLayer` holds a `QGraphicsScene&` and
  adds `QGraphicsObject` items.
- **F5. The overlay defects come from widget stacking.**
  [`CanvasMediaPresenter.cpp`](../../../native/node-editor/src/graph/CanvasMediaPresenter.cpp)
  computes a `QRegion` of the cards above each player, sets it as a widget
  mask (lines 227 to 256 and 313 to 333), and raises widgets in order (line
  359). The inline editors and the picker use the same pattern. Eight more
  places set `WA_AlwaysStackOnTop` on canvas overlays. In one scene graph,
  item order does this work.
- **F6. A tab is a nested `QMainWindow`.**
  [`EditorTabs.cpp`](../../../native/node-editor/src/ui/EditorTabs.cpp)
  creates one `EditorWindow` per tab inside a `QStackedWidget` (line 142).
  Each tab has its own scene, view and docks. All tabs share one
  `QQmlEngine`. The docks have `NoDockWidgetFeatures`, so they are fixed
  splitter panes.
- **F7. About 26 `QQuickWidget`s are created in eight files**, and 22 files
  name the type. Popups and dialogs are `QDialog` or `QQuickWidget` windows
  with `Qt::Popup` (ten `QDialog` sites).
- **F8. The QML is already Quick.** The 93 files and 16,899 lines under
  `qml/` form the `NodeTool.NodeEditor` module and take interface objects as
  required properties. The parity host
  (`native/parity/host/ParityHost.cpp`) mounts them in a `QQuickView` and
  captures with `grabWindow()`.
- **F9. Tests reach into QtNodes.** Of 124 test sources (47,561 lines), 61
  use `QGraphicsView`, `nodeGraphicsObject` or a `QtNodes` type. Tests call
  `grab()` 99 times. `CardBodiesTest.cpp` renders cards with
  `QGraphicsScene::render`.
- **F10. Capture goes through widgets.** `--screenshot` in
  [`main.cpp`](../../../native/node-editor/src/main.cpp) calls
  `window.grab()` (line 140). The spike showed that this path composes
  differently from the screen under RHI.
- **F11. The software backend is set in one line**,
  `QQuickWindow::setGraphicsApi(QSGRendererInterface::Software)` at
  `main.cpp` line 24, and again in the environment of every ctest entry.
- **F12. Only four editor tests run in CI.**
  `.github/workflows/native-graph-runner.yml` (lines 390 to 401) builds the
  editor and runs three single test functions and `node_editor_local_run`.
  The other gates in this plan run locally.
- **F13. Two tests already fail on the unchanged tree on this machine**:
  `node_editor_ui` and `node_editor_canvas_media_host`
  (`~/.cache/tp-native/logs/ne-ctest-software.log`). Each step records the
  failing set before it starts.
- **F14. The editor package shipped no license notices.** QtNodes is linked
  into the binary, so the BSD notice was owed. Q0 added
  `native/node-editor/licenses/QtNodes-BSD-3-Clause.txt`, which
  `scripts/package-macos.sh` copies. The Windows build has no packaging step
  that copies it yet.

## What depends on QtNodes and QGraphicsView

| Part | Files | Depends on | Already Quick |
|---|---|---|---|
| Graph model | `graph/WorkflowGraphModel` | `AbstractGraphModel`, `Definitions` | Not applicable |
| Scene and items | `graph/EditorScene` | `BasicGraphicsScene`, `NodeGraphicsObject`, `ConnectionGraphicsObject` | No |
| Geometry and painters | `graph/EditorScene.cpp`, `CardBodyPainter`, `CardControls` | `AbstractNodeGeometry`, `AbstractNodePainter`, `AbstractConnectionPainter` | No, QPainter |
| Interaction | `graph/EditorScene.cpp`, `EditorWindow::eventFilter` | `QGraphicsSceneMouseEvent`, QtNodes item handlers | No |
| Undo | `document/WorkflowDocument` | None. QtNodes `UndoCommands` run and are discarded | Not applicable |
| Selection | `EditorScene`, `EditorWindow` | `QGraphicsScene::selectedItems`, rubber band of `QGraphicsView` | No |
| Zoom and pan | `ui/EditorViewport.cpp`, `EditorWindow.cpp` | `QGraphicsView` transform and scroll bars | Readout is QML |
| Mini-map | `ui/MiniMap.h` | `QWidget`, `QGraphicsView` | Controls and popups are QML |
| Media on cards | `graph/CanvasMediaPresenter` | `QQuickWidget` children of the viewport | Content is QML |
| Inline editors | `graph/InlinePropertyPresenter`, `InlineTitlePresenter` | `QQuickWidget`, a `QGraphicsObject` note item | Content is QML |
| Picker | `graph/CompatibleNodePicker` | `QQuickWidget`, view event filter | Content is QML |
| Drops | `graph/CanvasDropController` | Widget drag events on the viewport | No |
| Lineage links | `graph/LineageLayer` | `QGraphicsObject` | No |
| Canvas overlays | `EditorWindow.cpp`, `EditorViewport.cpp`, `EditorChat.cpp`, `EditorPriceChip.cpp` | `QQuickWidget` | Content is QML |
| Panels, tabs, menus | `EditorPanels.cpp`, `EditorTabs.cpp`, `EditorMenus.cpp`, `EditorAppMenu.cpp` | `QDockWidget`, `QStackedWidget`, `QMenuBar`, `QDialog` | Content is QML |
| Capture | `main.cpp`, `tests/visual/Capture.cpp` | `QWidget::grab` | Parity host only |

## Design

### Class mapping

New classes live in `native/node-editor/src/canvas/`, in namespace
`nodetool::canvas`. Each keeps the structure of its QtNodes source.

| QtNodes or editor class | Quick class | What changes |
|---|---|---|
| `AbstractGraphModel`, `Definitions`, `ConnectionIdUtils`, `ConnectionIdHash` | The same, unmodified | Fetched until Q6, then vendored |
| `BasicGraphicsScene` | `CanvasScene` (`QObject`) | Same item maps, model signal slots and draft connection. No `QGraphicsScene` base, no undo stack |
| `EditorScene` | `EditorCanvasScene`, derived from `CanvasScene` | Same public methods and signals. Mouse handlers move to `CanvasInteraction` |
| `NodeGraphicsObject` | `NodeItem` (`QQuickItem`) | Shows a texture that the card painter fills. Holds `NodeState`. `setGeometryChanged`, `moveConnections` and `reactToConnection` keep their names |
| `ConnectionGraphicsObject` | `ConnectionItem` (`QQuickItem`) | Same end points, `pointsC1C2`, `move` and `ConnectionState`. `shape()` becomes `hitPath()` |
| `NodeState`, `ConnectionState` | The same, copied | Refer to the Quick items |
| `AbstractNodeGeometry` | The same interface | The editor's `NodeGeometry` moves over unchanged |
| `AbstractNodePainter` | `CardPainter`, `paint(QPainter*, const CardPaintState&)` | The state struct replaces the `NodeGraphicsObject&` argument |
| `AbstractConnectionPainter` | `WirePainter`, `paint` and `hitStroke` on `WirePaintState` | The same |
| `NodeConnectionInteraction` | The same, copied | Uses `NodeItem`, `ConnectionItem` and `CanvasScene` |
| `locateNodeAt` | `CanvasScene::nodeAt(scenePoint)` | Uses the grid index |
| `UndoCommands` (`ConnectCommand`, `DisconnectCommand`, `MoveNodeCommand`) | Direct model calls | The interaction calls `addConnection`, `deleteConnection` and `setNodeData` as each command's `redo()` did. `CreateCommand`, `DeleteCommand`, `CopyCommand` and `PasteCommand` are unused today and are not ported |
| `QGraphicsView`, `EditorViewport.cpp` | `GraphCanvas` (`QQuickItem`) and `CanvasViewport` | Zoom 0.12 to 4.0, pan, fit, animated moves, `mapToScene`, `mapFromScene` |
| `QGraphicsView::RubberBandDrag` | `RubberBandItem` and `CanvasSelection` | `keepEnclosedGroups` runs on the band as today |
| `QGraphicsScene` selection | `CanvasSelection` (`QObject`) | A set of node IDs and link IDs with `selectionChanged` |
| `EditorScene::drawBackground`, `drawForeground` | `GridItem`, `ForegroundItem` | The same paint code, into textures |
| `StyleCollection`, `NodeStyle`, `ConnectionStyle` | Two constants in `NodeLayout.h` | The editor reads one value from each |
| `MiniMap` (`QWidget`) | `MiniMapItem` (`QQuickPaintedItem`) | The same paint and navigation code |
| `LineageLayer` items | `LineageItem` (`QQuickItem`) | The same paths and signals |
| `CanvasMediaPresenter` widgets | Player items in a `CardOverlay` child of the `NodeItem` | No masks, no raise order |
| `InlinePropertyPresenter`, `InlineTitlePresenter` widgets | Editor items in the same `CardOverlay` | The presenters keep their QML-facing properties |
| `CompatibleNodePicker` widget | An item in the canvas overlay layer | The same controller |
| `CanvasDropController` | The same controller on `QQuickItem` drag events | The same MIME handling |
| `EditorWindow` (`QMainWindow`) | `EditorTab` (`QObject`) and `EditorShell` (`QQuickWindow` root) | Q7 to Q9 |

### Item tree

`GraphCanvas` is the viewport. Its children, back to front:

1. `GridItem`: the background grid and the axis marker.
2. A content item that carries the pan and zoom transform. Its layers are
   lineage links, groups, edges, cards, the draft edge and `ForegroundItem`.
3. An overlay layer in viewport coordinates: the rubber band, the picker, the
   toolbar, the selection toolbar, the zoom readout, the mini-map, the queue,
   the chat window, the node info panel and the price chip.

Card media and authored controls inherit their card's opacity and stacking.
When a card overlay is visible, the software backend draws individual item
tiles so Quick can interleave those overlays with overlapping cards. Inline
editors follow their card's opacity and position and sit in the viewport
overlay layer so they can extend over adjacent cards.

### Card and edge rendering

- On RHI, each raster tile has a `QSGImageNode` with its own texture. In Q3,
  the software backend batches visible draws in viewport tiles and damages
  only the tiles whose inputs changed. Q4 overlays must preserve the card
  stacking order during that composite.
- The UI thread rasterizes at `zoom × devicePixelRatio` on the device pixel
  grid. During a zoom gesture, existing images scale and new rasters use
  steps of √2. The canvas starts restoring exact-scale rasters 100 ms after
  the gesture ends.
- The raster cache schedules 512-device-pixel tiles for cards, wires and
  individual foreground primitives. It prioritizes visible tiles and limits
  offscreen retention to 64 MiB. The software pass
  draws only visible items
  ([performance rule 21](../../../native/ui_primitives/PERFORMANCE.md#rendering)).
- The scheduler keeps its state in the tiles, so rebuilding its plan after an
  edit never loses progress. The states are listed above
  `GraphCanvas::rebuildRasterWork`:
  - Every item has a published tile grid, which the renderers draw, and a
    staged grid for a change of scale, phase or tile layout. The staged grid
    replaces the published grid when its committed tiles match the requested
    geometry throughout the current viewport, including tiles painted empty.
    Publication accepts any content revision. A stale staged tile repaints after
    it is published. Content that changes on every frame cannot hold a grid
    change back.
  - While the view or an item moves, rasters keep their sub-pixel phase, as
    the QtNodes device cache does. 100 ms after the last move the canvas takes
    the device phase of a direct paint and the exact grid follows through
    staging.
  - A visible area with nothing on screen may use 3 ms of a frame. Stale
    visible tiles and prefetch stop at 1.4 ms. Missing tiles within one tile
    of the view share queue order with stale visible tiles, so animated cards
    leave time to fill the edge before a pan. Farther tiles fill nearest first.
    Only offscreen tiles are deferred or evicted for the byte budget.
  - Animated parts invalidate only their rectangles. A running card repaints
    the tiles touched by its rotating ring or pulsing status text. A card
    with a single-colour ring and no pulsing label needs no animation repaint.
    A flowing wire repaints its tiles.
  - A model reset keeps the items of nodes and connections that still exist,
    with their tiles, until the replacements are painted.
- The software grid paints the QtNodes crosses and axes, pixel for pixel,
  into an image once per view and copies the damaged region from it. A pan
  by whole device pixels at a zoom with an exact binary mapping, such as
  zoom 1, moves the image and paints only the exposed strips. The RHI grid
  repeats a texture painted at the view's fractional device offset.
- A tile of a long wire that its path does not reach stays empty without
  being painted, so a diagonal draft wire repaints only its path's tiles.
- Until Q11, the running ring is part of the card raster. Only the tiles it
  touches repaint, and only within its rectangles.
- `ConnectionItem` uses the same texture path with `WirePainter` until Q11.

### Large graphs

Measured today, from the spike logs of `node_editor_large_graph`
([`LargeGraphTest.cpp`](../../../native/node-editor/tests/perf/LargeGraphTest.cpp)):

| Measure | Today | Target |
|---|---|---|
| Card drag, 72 nodes, per pointer move | 31.6 ms (Vulkan on lavapipe), 80.8 ms (OpenGL). The test fails above 100 ms | UI thread work under 4 ms. The limit drops to 16 ms in Q5 |
| Add a node with the window shown, 2,000 nodes | 623 to 725 µs | No slower |
| Event loop after the batch of 2,000 | 221 to 239 ms | No slower |
| Pan, 2,000 nodes | 8 to 13 ms a step at zoom 1, 33 to 40 ms at zoom 0.12 (software, [README](../../../native/node-editor/README.md#large-graph-baseline)) | No raster. UI thread work under 2 ms a frame |
| Zoom settle, 2,000 nodes | 48 to 67 ms a wheel notch, painted at once with no settle work (software) | Raster spread over frames, at most 4 ms a frame |

The frame budget is 16 ms at 60 FPS, with a few milliseconds for the UI
thread ([rule 1](../../../native/ui_primitives/PERFORMANCE.md#frame-budget)).
The measures follow rules 27 and 29: a realistic count, and frame times from
`QSG_RENDER_TIMING=1`.

- Items are C++ objects without a QML context. The rule against a `Repeater`
  over a growing list (rule 3) is met by not using QML for cards at all.
- A uniform grid index holds node and edge bounds. Hit tests, the rubber band
  and culling query it. The index updates on `nodePositionUpdated` and
  `nodeUpdated`.
- At zoom 0.12 a 280 by 400 card is 34 by 48 pixels. The sum of card textures
  on screen stays near the pixel count of the viewport.
- Card textures are created with the atlas flag, so small cards batch.

### Threads and ownership

- Every class in `canvas/` is UI thread only and says so in its top comment
  ([native rule 9](../../../native/AGENTS.md#threads)).
- `CanvasScene` owns each `NodeItem` and `ConnectionItem` through a
  `std::unique_ptr`, as `BasicGraphicsScene` does. The items have a visual
  parent (`setParentItem`) and no `QObject` parent, so rule 3 holds.
- `GraphCanvas` owns `CanvasScene`, `CanvasViewport`, `CanvasSelection` and
  `CanvasInteraction` as members. The scene borrows the model by reference.
  The tab destroys the canvas before the model, as `~EditorWindow` orders the
  scene today.
- An overlay item made from a `QQmlComponent` has its `CardOverlay` as
  `QObject` parent. This is the Qt parent exception of rule 2, and the code
  documents the parent.
- `updatePaintNode` runs on the render thread while the UI thread is blocked.
  It reads the tile images and their placement. The scene graph owns the
  returned nodes and textures.
- An item drops its tile images in `releaseResources()` and on
  `ItemSceneChange`. The raster queue rebuilds on the next window.
- `GraphCanvas` owns the foreground tile items, queue and budget on the UI
  thread. The zoom settle timer schedules the next raster pass. Connections
  from the model to items use the item as context object, so they end with
  the item (rule 13).
- No new global state. The graphics API choice is made once in `main()`.
- With the timeline player, decoder threads stay inside `SourcePool` and the
  compositor renderer stays on the render thread, as in the timeline app. One
  player plays at a time in a process.

### Capture

- A helper `CanvasCapture` has two modes.
  - Scene: `QQuickWindow::grabWindow()`. It renders the one scene graph, so
    no widget composition stage remains that could differ.
  - Screen: `QScreen::grabWindow()` on `xcb` under `xvfb`, which reads what
    the window system received.
- `--screenshot`, `tests/visual/Capture.cpp` and the 99 `grab()` calls in
  tests move to the scene mode as their surfaces move to Quick.
- A `render`-labelled test, `node_editor_composition`, captures both modes
  for the four cases of the spike (media over a card, the chat window over
  media, the inline note editor over media, the picker) and requires them to
  match. The spike's files
  `/tmp/claude-1000/-home-mg--t3-worktrees-nodetool-t3-602d183a/32cd9de1-9192-4b79-9d80-a74798f541d3/scratchpad/profile/*-grab.png`
  and `*-screen.png` are the reference for the failure.
- The parity harness needs no change. Its host already captures a
  `QQuickView`.

### Licenses

QtNodes is BSD-3-Clause, copyright 2022 Dmitry Pinaev.

- Vendored files go to `native/node-editor/third_party/qtnodes/`, with
  `LICENSE.rst` beside them and a `README.md` that names the commit and lists
  the files. The timeline uses `third_party/` the same way.
- A new file adapted from QtNodes source (`CanvasScene`, `NodeItem`,
  `ConnectionItem`, `NodeState`, `ConnectionState`,
  `NodeConnectionInteraction`) carries a header comment with the copyright
  line, the license name, the upstream file and commit, and a note that it
  was changed.
- Binary packages must reproduce the notice. Add
  `native/node-editor/licenses/QtNodes-BSD-3-Clause.txt`, following
  `native/timeline/licenses/`, and copy it in the packaging scripts.
- The third clause forbids using the author's name to endorse the editor.
  The README keeps its neutral attribution.

## The timeline player plan

[The timeline player plan](../timeline-player/plan.md) is being implemented.
Its S0 and S1 are in progress.

- **Its D1 is answered.** The current editor cannot use RHI. After Q10 of
  this plan it can.
- **S0 to S4 and S6 do not depend on this plan.** They move code inside
  `native/timeline` and `native/timeline-player`. This plan edits
  `native/node-editor`. The only shared files are the checker policies in
  `native/ui_primitives/tools/` and the CI path filters.
- **S5 shrinks.** It keeps `StaticTimelineSource`,
  `TimelinePlayerController` and `TimelinePlayer.qml`, with a new
  `tst_timelineplayer`. It drops the `CompositorCore` extraction,
  `OffscreenCompositor`, `TimelineFrameItem` and `tst_offscreencompositor`.
  `TimelinePlayer.qml` always uses `PreviewCompositor`. When the window's
  graphics API is Software, the controller reports `status: unavailable`.
  The risk "GPU context in the node editor" of that plan no longer applies.
- **S7 lands after Q10.** The compact player becomes a child of the card's
  `CardOverlay`, like any card media. The document tab is an `EditorShell`
  tab. The editor calls `nt::hw::selectGraphicsApi` and
  `nt::hw::prepareWindow` on its one window, so hardware decode works as in
  the timeline app. S7's test with a fake loader runs on the software
  backend and checks the unavailable state. A `render` test checks a frame.
- **Its D2 is unchanged.** `native/media` moves onto `FfmpegSource`. Land
  that after Q10, so that card video uses the GPU path at once. Q4 changes
  only the parent of `CardMediaPlayer.qml`, not its video element, so the
  two changes do not overlap. On the software backend, card video needs a
  path from a decoded frame to a `QImage`.
- **Q10 needs the `hw/` module** from the shared decode library, which S2
  moves.

Recommended order:

1. Timeline S0 to S4, and S6, continue now.
2. Q0 to Q9 of this plan run in parallel.
3. Q10, after timeline S2.
4. Timeline S5 in its reduced form. It can merge any time after S4.
5. Timeline S7 and the D2 media move, after Q10.

## Steps

Each step merges alone, and the editor works after each step. Every step
also runs these gates:

- `cmake --build "$B" --target nodetool-node-editor`
- `python3 native/ui_primitives/tools/check_design.py --strict`
- `python3 native/ui_primitives/tools/check_dependencies.py`
- `npm run test:affected:native`
- The step's ctest list, compared with the failing set recorded before the
  step (F13).
- AddressSanitizer and UndefinedBehaviorSanitizer runs of the step's tests
  ([native rule 15](../../../native/AGENTS.md#verification)).

Two test groups are named below.

- **Canvas group**: `node_editor_ui`, `node_editor_large_graph`,
  `node_editor_canvas_media`, `node_editor_canvas_media_host`,
  `node_editor_inline_title`, `node_editor_inline_host`,
  `node_editor_inline_property`, `node_editor_compatible_picker`,
  `node_editor_compatible_picker_host`, `node_editor_group_authoring`,
  `node_editor_group_presentation`, `node_editor_canvas_authoring`,
  `node_editor_canvas_drop`, `node_editor_canvas_chrome`,
  `node_editor_card_bodies`, `node_editor_media_cards`,
  `node_editor_selection_presentation`, `node_editor_lineage_host`,
  `node_editor_reroute_presentation`, `node_editor_body_connection`,
  `node_editor_body_drop_host`, `node_editor_dynamic_card`,
  `node_editor_dynamic_ports`, `node_editor_subgraph_card`,
  `node_editor_navigation`, `node_editor_viewport_navigator`,
  `node_editor_window_parity`, `node_editor_incremental_projection`,
  `node_editor_runtime_ui`, `node_editor_price_chip`,
  `node_editor_visual_capture` and `node_editor_smoke`. Quick raster invariants
  run in `node_editor_quick_canvas` and its three additional DPR entries.
- **Shell group**: `node_editor_workflow_tabs`,
  `node_editor_workflow_tabs_drag`, `node_editor_menus`,
  `node_editor_chrome_parity`, `node_editor_header_row`,
  `node_editor_chat`, `node_editor_chat_tools`, `node_editor_queue_ui`,
  `node_editor_document_property`, `node_editor_library_panel`,
  `node_editor_catalog`, `node_editor_versions_host`,
  `node_editor_setup_host`, `node_editor_pack_setup_host`,
  `node_editor_server_sync_host`, `node_editor_autosave_host`,
  `node_editor_run_trace` and the `node_editor_exit_*` entries.

### Q0. Reproduction, baseline and notices

Small, about 400 lines.

- Add `CanvasCapture` and the `node_editor_composition` test. On the
  software backend it passes today and is a gate. Its RHI variant fails on
  the current canvas, which reproduces the defect. Register that variant
  disabled, with the failure recorded in the test's comment.
- Add a pan and zoom measure for 2,000 nodes to `LargeGraphTest` and record
  today's numbers in the README.
- Add `licenses/QtNodes-BSD-3-Clause.txt` and copy it in the packaging
  scripts.
- Gate: `node_editor_large_graph`, `node_editor_composition`.

### Q1. Canvas seam

Large and mechanical: about 28 source files and 61 test files, 2,500 lines
changed. No behaviour changes.

- Add `CanvasSurface`, an interface for what the rest of the editor needs
  from the canvas: scene and viewport mapping, zoom and centre, node and edge
  rectangles, the node at a point, selection, repaint requests, cursor, focus
  and capture. `QtNodesCanvas` implements it over `EditorScene` and the
  `QGraphicsView`.
- `EditorWindow`, the four presenters, `CanvasDropController`, `MiniMap` and
  `LineageLayer` use the seam. Selection goes through `CanvasSelection`,
  backed by the scene's selection.
- Add `tests/support/CanvasProbe.h` (node rectangle in window coordinates,
  pointer events to the canvas, card render to an image). Tests stop naming
  `QGraphicsView` and `nodeGraphicsObject`.
- Gate: the full node editor ctest.

### Q2. Painters and interaction without QtNodes view types

Large: about 3,000 lines moved or edited in `EditorScene.cpp`.

- `NodePainter` and `WirePainter` paint from `CardPaintState` and
  `WirePaintState`. The QtNodes painters become adapters that fill the
  structs from the graphics objects.
- The mouse, key and focus handlers of `EditorScene` and
  `EditorWindow::eventFilter` move into `CanvasInteraction`. It takes a
  neutral pointer event (scene position, screen position, buttons, modifiers,
  zoom) and a host interface for the base behaviour. The QtNodes host
  forwards to `QGraphicsScene`.
- Gate: the canvas group, with attention to `node_editor_card_bodies` and
  `node_editor_window_parity`, which compare pixels.

### Q3. Quick canvas behind a switch

Large: about 5,000 new lines.

- Add `GraphCanvas`, `CanvasScene`, `EditorCanvasScene`, `NodeItem`,
  `ConnectionItem`, `CanvasViewport`, `RubberBandItem`, `GridItem`,
  `ForegroundItem`, `LineageItem`, `MiniMapItem`, the grid index, and the
  copied `NodeConnectionInteraction` and state classes. `QuickCanvas`
  implements `CanvasSurface`.
- `NODETOOL_NODE_EDITOR_CANVAS=quick` selects it. The canvas sits in one
  `QQuickWidget` in place of the `QGraphicsView`. The app stays on the
  software backend. Overlays stay widget children above it, which the
  software backend composes correctly.
- Register the canvas group a second time with the switch set, as
  `<name>_quick`.
- New tests in `node_editor_quick_canvas`: items follow each model signal,
  hit tests and z-order, the draft connection and reconnect state machine,
  rubber band with enclosed groups, culling, and teardown during a drag.
- Gate: the canvas group in both modes. `node_editor_large_graph_quick`
  meets the targets for drag, add and pan.

### Q4. Overlays in the scene

Medium to large: about 2,500 lines changed, small QML edits.

- Add `CardOverlay` for media and authored controls on the Quick canvas.
  Inline editors, the picker, toolbars, zoom readout, mini-map controls,
  queue, chat, node info panel and price chip use the viewport overlay layer.
- The Quick path uses item stacking and input delivery. Widget masks,
  `WA_AlwaysStackOnTop`, widget raise order and `CanvasMediaWidget` wheel
  forwarding stay in the QtNodes branch until Q6.
- Gate: the `_quick` entries of `node_editor_canvas_media`,
  `node_editor_canvas_media_host`, the three inline tests, both picker tests,
  `node_editor_canvas_chrome`, `node_editor_selection_presentation`,
  `node_editor_price_chip`, `node_editor_queue_ui`, `node_editor_chat`, and
  `node_editor_composition` on the software backend.

### Q5. Quick canvas by default

Quick is the default. The test switch
`NODETOOL_NODE_EDITOR_TEST_LEGACY_CANVAS=1` selects QtNodes for the compatibility
gate until Q6.

- The parity fixtures exercise the shared Quick scene, including canvas input,
  card and overlay stacking, inline editors, media and runtime updates. The
  Quick box-selection test counts two cards and their wire.
- The Quick software drag limit is 16 ms per pointer move. The tighter 4 ms mean limit
  remains in place, and the QtNodes test keeps its existing budget until Q6.
- See [canvas verification](../../../native/node-editor/docs/parity.md#quick-canvas)
  for the native captures, component runner and web visual comparison.
- Gate the complete node editor CTest suite in default mode and the canvas
  group with the legacy test switch.

### Q6. QtNodes leaves

Medium: mostly deletion, about 3,000 lines removed.

- Delete `QtNodesCanvas`, the QtNodes adapters of Q2, the `MiniMap` widget,
  the widget paths of the presenters and the `_quick` duplicates.
- Vendor `AbstractGraphModel.hpp`, `AbstractGraphModel.cpp`,
  `Definitions.hpp`, `ConnectionIdUtils.hpp` and `ConnectionIdHash.hpp` with
  the `AbstractNodeGeometry` interface into `third_party/qtnodes/`. Remove
  `cmake/QtNodes.cmake` and the `QtNodes` link target.
- Update `README.md`, `docs/plans/native-node-editor.md` (its D1 and D2) and
  `docs/parity.md`.
- Gate: the full node editor ctest, and a search that finds no include of
  `QtNodes/internal/` outside `third_party/`.

### Q7. Shell seam

Large and mechanical: about 2,000 lines changed in `EditorWindow.cpp`,
`EditorPanels.cpp`, `EditorTabs.cpp`, `EditorMenus.cpp` and tests.

- Split `EditorWindow` into `EditorTab` (`QObject`: document, session,
  model, canvas, presenters, interface objects) and the widget window.
- Add `PanelHost`, an interface for panels, docks, popups and dialogs by
  name. The widget shell implements it. Tests look up panels through it and
  stop calling `findChildren<QQuickWidget *>()` and
  `findChild<QDockWidget *>()`.
- Gate: the shell group and the canvas group.

### Q8. Quick shell behind a switch

Large: about 3,500 new lines of C++ and QML.

- Add `EditorShell`: one `QQuickWindow` with a root QML file. The rail, tab
  bar and status bar frame a `SplitView` with the dock panes. A `StackLayout`
  holds one `GraphCanvas` per tab. Panels are plain items.
- Popups and context menus become Quick `Popup`s. Dialog hosts become Quick
  windows. The menu bar is built from the existing command table.
- `NODETOOL_NODE_EDITOR_SHELL=quick` selects it. The backend is still
  software.
- Register the shell group a second time as `<name>_quick`.
- Gate: both groups in both shell modes, and `node_editor_composition`.

### Q9. Quick shell by default, widgets shell leaves

Medium: mostly deletion.

- Flip the default, then delete the widget shell, `Qt6::QuickWidgets` and
  the `QMainWindow`, `QDockWidget` and `QStackedWidget` code. No
  `QQuickWidget` remains.
- `--screenshot` and every test capture use `CanvasCapture`.
- Gate: the full node editor ctest, and a search that finds no
  `QQuickWidget`, `QGraphicsView` or `QDockWidget` under
  `native/node-editor`.

### Q10. RHI

Medium: about 500 lines, plus CI.

- Remove `setGraphicsApi(Software)` from `main.cpp`. Add the backend choice
  of D5: environment first, then a probe, then software.
- Call `nt::hw::selectGraphicsApi` and `nt::hw::prepareWindow` from the
  shared decode library.
- Enable the RHI variant of `node_editor_composition`. Add the `render`
  label and run it in CI on lavapipe under `xvfb`. Logic tests keep the
  software environment.
- Gate: the full ctest on software. The `render` label on Vulkan and
  OpenGL. A manual start with an invalid `VK_ICD_FILENAMES` shows the
  software fallback and the notice.

### Q11. Edges and run animation on the GPU

Medium: about 1,200 lines and two shaders. Depends on D3.

- On RHI, `ConnectionItem` returns a `QSGGeometryNode` with a material whose
  fragment shader draws the antialiased stroke and the dashes from arc
  length. The flow offset is a uniform. The painted path stays for the
  software backend.
- The running ring uses a shader node in the same way.
- Gate: a `render` test compares the shader path with the painted path
  within a tolerance, for plain, selected, streaming, flowing, bypassed and
  control edges. A run with 200 flowing edges holds 16 ms a frame.

## Risks

- **R1. Parity drift (highest risk).** `docs/parity.md` records behaviour
  tied to QtNodes details, such as the bounds margin of a wire and the
  reverse-offset limit. Q1 and Q2 exist so that the same tests run against
  both canvases before any default changes.
- **R2. Text in scaled items.** Inline editors and players become children of
  a scaled card. Text, the input method rectangle and popups of controls
  inside them must work at zoom 0.12 to 4. Today the title editor receives
  the zoom as a property and lays out in viewport pixels.
- **R3. Software backend cost.** The software renderer repaints what a pan
  dirties. With 2,000 image nodes, a pan may cost more than the targets
  allow. Q3 measures this before Q4 starts.
- **R4. Texture memory at high zoom and device pixel ratio.** A card at zoom
  4 and ratio 2 is 64 times its logical pixel count. Bound the texture size
  and the total raster cache while keeping the device scale exact.
- **R5. Focus and shortcuts.** The widget code accepts `ShortcutOverride` in
  overlay widgets and filters events on the view. One Quick window has one
  focus chain, so each of these rules needs a Quick equivalent and a test.
- **R6. Drag and drop.** Catalog drags and file drops arrive as widget
  events today. `GraphCanvas` must take them through `QQuickItem` drag
  events with the same MIME types.
- **R7. Two shells and two canvases at once.** The duplicate ctest entries
  double the time of the two groups from Q3 to Q9. Q6 and Q9 must follow
  their defaults quickly.
- **R8. Popups that leave the window.** Context menus near a window edge are
  top-level popups today. A Quick `Popup` inside the window clips at the
  edge unless it uses a window popup type.
- **R9. Qt version.** The timeline pins Qt to exactly 6.12 for `QRhi`. Q10
  gives the editor the same limit.
- **R10. Checker and CI coverage.** New QML must pass `check_design.py`.
  Only four editor tests run in CI (F12), so regressions in the gates of this
  plan show locally only, until the `render` job of Q10 exists.

## Unverified

- Whether `QRhi::probe` gives a useful answer for Vulkan and OpenGL in Qt
  6.12, or whether the probe must create a `QRhi`.
- Whether `QQuickWindow::grabWindow()` under RHI returns the presented frame
  for `QQuickRhiItem` content. The spike compared `QWidget::grab()` with the
  screen, not this call.
- Whether `QScreen::grabWindow()` works on the offscreen platform, on
  Wayland and on macOS without a screen recording permission. The plan
  assumes `xcb` under `xvfb` only.
- The software backend's drag and pan cost. The software ctest log has the
  test duration (9.2 s) and no per-move number.
- Whether the QML panels and overlays assume a root sized by
  `SizeRootObjectToView`, and how many need edits in Q4 and Q8.
- How a Quick window delivers `QNativeGestureEvent` (trackpad pinch) to a
  C++ item, and whether a `PinchHandler` is needed.
- The popup type behaviour of Quick `Popup` on Wayland and on the offscreen
  platform, and a native menu bar on macOS from Quick.
- Whether the pixel tests of `CardBodiesTest` produce identical images
  through a `QImage` raster as through `QGraphicsScene::render`.
- Whether small card textures enter the atlas on all backends, and the draw
  call count for 2,000 visible cards.
- Where the source of the spike's `node_editor_rhi_composition_profile`
  program is. Only its build output and captures were found.
- All size estimates. They come from line counts, not from a prototype.

## Files to read first

- `native/node-editor/src/graph/EditorScene.cpp`
- `native/node-editor/src/graph/WorkflowGraphModel.h`
- `native/node-editor/src/graph/CanvasMediaPresenter.cpp`
- `native/node-editor/src/ui/EditorWindow.cpp`, lines 520 to 1020 and 4142
  to 4381
- `native/node-editor/src/ui/EditorViewport.cpp`
- `native/node-editor/tests/perf/LargeGraphTest.cpp`
- QtNodes at the pinned commit: `src/BasicGraphicsScene.cpp`,
  `src/NodeGraphicsObject.cpp`, `src/ConnectionGraphicsObject.cpp`,
  `src/NodeConnectionInteraction.cpp`
- `native/timeline/src/preview/hw/HwWindow.h`
