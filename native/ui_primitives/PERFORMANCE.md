# Qt Quick performance

These rules keep native panels smooth when they load and scroll. They apply to
every Qt Quick view under `native/`. The reference implementation is the
Library asset grid: [`AssetGrid.qml`](../media/qml/AssetGrid.qml),
[`AssetItem.qml`](../media/qml/AssetItem.qml) and
[`AssetListModel.h`](../media/src/AssetListModel.h).

The rules condense the Qt documentation:
[Performance considerations](https://doc.qt.io/qt-6/qtquick-performance.html),
[Best practices](https://doc.qt.io/qt-6/qtquick-bestpractices.html),
[Scene graph renderer](https://doc.qt.io/qt-6/qtquick-visualcanvas-scenegraph-renderer.html)
and [Profiling QML](https://doc.qt.io/qtcreator/creator-how-to-profile-qml.html).
Read the source page when a rule needs more detail.

## Frame budget

1. The timeline targets 120 Hz, so a frame has about 8.3 ms. Keep GUI-thread
   work to about 4 ms per frame. The render thread needs the rest, and the GUI
   thread blocks during the sync step. Move decoding, parsing, file and network
   work to a worker thread and hand results back with a queued signal, as
   [native rule 10](../AGENTS.md#threads) requires.
2. Never call `processEvents()` or spin a nested event loop from C++ that QML
   calls. Other bindings run in the middle of the handler and can destroy the
   items it is using.

## Lists and grids

3. Show a list that can grow with `ListView`, `GridView` or `TableView`. A view
   builds only the delegates near the viewport. A `Repeater` inside a
   `Flickable`, `ScrollView`, `Column` or `Flow` builds every item at once. Use
   a `Repeater` only for a small, fixed set, such as form fields or tabs.
4. Set `reuseItems: true` and reset delegate state in `onPooled` or
   `onReused`. Set `cacheBuffer` to one or two rows, or one screen, so
   delegates exist before they scroll in. Each cached delegate uses memory.
5. Show a grouped grid as one `ListView` of lines: a header line for each
   group, then rows of `columns` cards. The examples panel does this in
   [`ExamplesPanel.qml`](../node-editor/qml/ExamplesPanel.qml).
6. Keep delegates small: few items and few bindings. Position children with
   plain `x`, `y`, `width` and `height` bindings or anchors, not Qt Quick
   Layouts. Do not put `clip`, `ShaderEffect` or `layer.enabled` in a
   delegate.
7. Do not bind a delegate to `contentY` or another property that changes on
   every scroll frame. That binding runs once per delegate per frame. Let the
   view decide what is near the viewport.
8. Keep state that must survive scrolling, such as selection or expansion, in
   the model. A view destroys and reuses delegates, so delegate state is lost.

## Models

9. Expose a long or changing list as a C++ `QAbstractListModel` that updates
   only the rows that differ. `AssetListModel::apply()` does this, so the view
   keeps its delegates, thumbnails and scroll position across server polls.
   Use a QML `ListModel` only for a small, static list.
10. A `QVariantList` or JS array model resets the view and rebuilds every
    delegate each time its property notifies. Give list content its own
    `NOTIFY` signal. Do not share one broad `changed` signal with unrelated
    state, such as a busy flag or a selection.
11. Do not compute a model in a binding that reads unrelated properties. Each
    read becomes a dependency, and each dependency change rebuilds the list.
    Rebuild the array in a function that runs on the list signal instead.

## Bindings and JavaScript

12. Prefer declarative bindings to imperative assignments in signal handlers
    and `Component.onCompleted`. An assignment in `onCompleted` evaluates the
    property twice.
13. Keep binding expressions short. A binding runs again when any property it
    reads changes.
14. In a loop, read a property into a local variable once, accumulate the
    result locally, and assign the property once at the end. Each assignment
    re-evaluates every binding that depends on the property.
15. Changing one element of a list property, or one field of a value type such
    as `font` or `color`, costs as much as assigning the whole value and
    notifies every dependent. Edit a local copy and assign it back once.
16. Declare concrete property types (`int`, `string`, `real`, a QML type)
    instead of `var`, and use `required property` in delegates. Typed code
    compiles ahead of time, and untyped code falls back to the interpreter.
    Use `pragma ComponentBehavior: Bound` in files that use `required`
    properties in delegates.
17. Do not call `gc()` or use `eval()`. Do not create a `url` from a string
    repeatedly in a hot path.

## Images and text

18. Load images with `asynchronous: true` and a `sourceSize` that matches the
    displayed size times the device pixel ratio. A full-size decode on the UI
    thread stalls scrolling. Changing `sourceSize` later reloads the image.
19. Set `smooth` only when the image is scaled. Do not set `mipmap` on
    ordinary images, because a mipmapped image does not use the texture atlas
    and does not batch.
20. Use `Text.PlainText` when the content has no markup. Avoid `RichText`.
    Elide long text instead of clipping it.

## Rendering

21. Set `visible: false` on an item that is hidden or fully covered. The
    renderer does no occlusion culling, and `opacity: 0` still renders and
    still runs bindings and animations.
22. Prefer opaque items. An opaque item batches freely, but translucent items
    that overlap need separate draw calls. One translucent pixel makes a whole
    image translucent.
23. Do not set `clip` on small items such as buttons, labels and cells,
    because it breaks batching for their children. A clip on a large container
    such as a `ListView` is acceptable.
24. Use `Item` instead of `Rectangle` as a root when the item draws no
    background. Do not cover the window with a full-size `Rectangle`. Set the
    window color instead.
25. Limit `layer.enabled`, `ShaderEffectSource` and `opacity` on subtrees.
    Each renders into an offscreen texture.
26. Load rarely shown parts, such as menus, previews and editors, in a
    `Loader` that is active only when needed. Do not wrap small items in a
    `Loader`, because each one adds an item and a QML context.

## Measure

27. Measure before and after a change, and report the numbers. Test a view
    with a realistic row count, such as several hundred rows, not only with
    the two or three rows of a small fixture.
28. Find slow bindings, JavaScript and component creation with the QML
    profiler. Build with QML debugging enabled
    (`target_compile_definitions(<target> PRIVATE QT_QML_DEBUG)`), then run
    `qmlprofiler -o trace.qtd <app>`, or start the app with
    `-qmljsdebugger=port:3768,block` and run
    `qmlprofiler --attach localhost -p 3768 -o trace.qtd`. Open the trace in
    Qt Creator. Look for long "Creating" and "Binding" events while scrolling.
    Never ship a build with QML debugging enabled.
29. Find render cost with environment variables:
    - `QSG_RENDER_TIMING=1` logs the time of each frame.
    - `QSG_RENDERER_DEBUG=render` logs batch counts and re-uploads.
    - `QSG_VISUALIZE=batches`, `clip`, `changes` or `overdraw` colors the
      window to show unmerged batches, clips that break batching, items that
      change each frame and translucent overdraw.

## Data across C++ and QML

30. Do not send a JSON or QVariant document across C++ to QML in a hot path.
    The engine deep-copies a `QVariantList`, `QVariantMap`, `QJsonArray` or
    `QJsonObject` into new JavaScript values on each read. Expose rows as
    `QAbstractListModel` roles, or answer a small `Q_INVOKABLE` query that
    returns a scalar. Send patches, not full arrays: emit `dataChanged` for
    the changed rows and roles. A hot path is any code that runs on a
    playback tick, scroll, zoom, drag, pointer move or meter update.
31. Give each `Q_PROPERTY` its own `NOTIFY` signal. A shared `changed()`
    signal re-evaluates every binding on every property that uses it.
32. Expose a small record as a `Q_GADGET` with `QML_VALUE_TYPE`, not as a
    `QVariantMap`. Typed fields compile ahead of time. Use a map only at a
    JSON boundary.
33. Use `QQmlListProperty` only for child objects declared in QML. A view
    resets on any change to it.
34. Register C++ objects with `QML_ELEMENT` or `QML_SINGLETON`. Do not use
    `setContextProperty`. The compiler cannot type a context property, so
    every binding that reads it runs in the interpreter.

## Delegates

35. A delegate reads its own roles. Do not scan the whole model in a
    delegate: no `indexOf`, `filter`, `find` or `mapToItem` over all rows.
    Expose `selected`, `pinned` and similar flags as roles that C++ updates.
36. Qualify every lookup (`root.width`, not `width` from an outer scope) and
    fix `qmllint` unqualified-access warnings in hot files.
37. Do not give each delegate its own `Menu`, `Popup`, `ToolTip` or
    `Instantiator`. Share one per view and open it with the row as an
    argument. Set `active: false` on an `Instantiator` in a closed menu.

## Drawing

38. Draw curves, rulers, grids, waveforms, meters and note lanes in a C++
    `QQuickItem` with `updatePaintNode` and one `QSGGeometryNode`. Do not use
    `Canvas` or a full-size `QQuickPaintedItem` for content that changes on
    scroll, zoom or a playback tick. Both re-rasterize the whole area and
    upload a new texture.
39. Do not repaint for a scroll. Move the drawn item with `x` or a
    transform, and redraw only when the visible range leaves the drawn range.
40. Draw a moving marker, such as a playhead or a step outline, as its own
    small item. The content under it does not repaint.
41. Draw more than about 100 repeated marks, such as ticks, grid lines or
    meter segments, in one node instead of one `Rectangle` each.
42. Copy data into scene-graph nodes only in `updatePaintNode`. The GUI
    thread is blocked there, so it is the only safe hand-off to the render
    thread.

## Timers and clocks

43. Drive meters and playheads from one clock per window. Do not run a
    `Timer` per item. Stop the clock when the panel is hidden.

## Loading

44. Open a heavy panel with `Loader { asynchronous: true }` and show a
    placeholder until the status is `Loader.Ready`. Creation then spreads
    over several frames.

## Measure in tests

45. Measure timing in an offscreen test: set `QT_QPA_PLATFORM=offscreen` and
    `QSG_RENDER_LOOP=basic`, time the action with `QElapsedTimer`, and assert
    a budget. Also assert the item count of the panel, because it is stable
    across machines. The timeline harness is `tst_timeline_perf`; see
    [its README](../timeline/tests/measure/README.md).

46. Gate a performance budget on counters, not on time. Counters are stable
    across machines: object and delegate creations, C++ to QML crossings,
    payload bytes, rows notified and signal emissions. Report times, but do
    not fail a test on them. Store budgets in a file that accepts only lower
    values, and prove that the gate fails on a deliberate regression.
47. Do not read the frame times of the software backend
    (`QT_QUICK_BACKEND=software`) as the result for the GPU. They include
    CPU rasterization. Use them to compare before and after only.
48. Do not start a headless profiler run with `-qmljsdebugger=...,block`
    unless a client attaches. The process waits forever.
49. Make a measurement hook cost one relaxed atomic check when measurement is
    off. Do not build payloads, strings or JSON for a counter that nobody
    reads.

## Edits and change notification

50. Do not use one coarse signal, such as `timelineChanged`, as the change
    notification for the whole document. Each listener derives its state
    again, and this fan-out costs more than the edit itself. Return a change
    set from each edit (changed IDs, roles and structural flags) and emit
    `dataChanged` only for those rows and roles. Do not add new connections
    to a coarse signal.
51. Parse each changed entity once for each edit. Do not compare or parse
    unchanged entities.
52. Do not put large arrays, such as notes, controllers or versions, in an
    entity map that QML reads. Expose typed scalar properties or model roles.
    One map read can copy megabytes.
53. Keep a gesture, such as a note drag or a clip drag, as typed overlay
    state in C++. Commit one patch on release. Do not write a full array,
    such as a `setNotes` list, for a drag. Register the patch as a named edit
    with a JSON payload, so agents and headless tools use the same edit.
54. Key a cache on every input that its output reads. If a key cannot be
    complete, drop the cache. A stale cache is a correctness defect, not a
    performance trade-off.
55. Use an index for hit tests and range queries over dense content, such as
    an interval index for notes. Do not scan every item for each pointer
    event.

## Menus and lazy content

56. Build menu rows only while the menu is open, and release them on close.
    A closed menu creates no items. When the target of an open shared menu
    is deleted or scrolls away, close the menu.
57. Do not decode an image that is hidden or not laid out. Bucket
    `sourceSize` to steps, such as 128 physical pixels, so that a dock
    resize does not decode on each frame.
58. A test that uses a row of a virtualized view must scroll to it first,
    with `positionViewAtIndex`. Do not expect a delegate for a row that is
    not visible.

## Typing

59. Untyped QML (`property var`, unqualified lookups) costs less than the
    items above. Type the files that run on hot paths, but do not run a
    project to type all files for performance.

Run `npm run check:native-performance` to check per-file debt in `native/*/qml` and `native/*/src`, or `npm run check:native-performance -- --update` to save lower baseline counts.
