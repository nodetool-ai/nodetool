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

1. A frame at 60 FPS has about 16 ms. Keep work on the UI thread to a few
   milliseconds per frame. Move decoding, parsing, file and network work to a
   worker thread and hand results back with a queued signal, as
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
