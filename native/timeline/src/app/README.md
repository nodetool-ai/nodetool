# Timeline extension points

Every `module.cmake` under `src/` or `qml/` is included in sorted path order.
A nested module owns its source list. Existing test sources stay in `tests/`.

Use `nt_sources(core|decode|audio|server ...)` for library code,
`nt_sources(app ...)` for executable code, `nt_qml_files(...)` for QML and JS
resources outside `qml/`, and `nt_qml_sources(...)` for C++ QML types. QML contributions build
into the `NodeTool.Timeline` module in the app and its UI tests. `nt_qml_sources` also adds their directories to the QML targets' include
paths for Qt's generated type registration. A module can register a callback with `nt_tests(function_name)`
to create its own test target and call `add_test`. Callbacks run after the
shared targets and `nt_add_timeline_qml` exist. `nt_sources(target_name ...)`
and `nt_target_sources(target_name)` let a nested module contribute sources
to a target created by its parent's callback.

Every `.qml` and `.js` file under `qml/` enters the module automatically.
Adding or removing a file reruns configure. Explicit `nt_qml_files` listings
still work and are deduplicated. A QML file starting with `pragma Singleton`
is marked as a singleton automatically.

A QML-only package can register a panel in its own QML file:

```qml
// nt-panel: slot=overlay id=transformGizmo order=10 title="Transform"
```

Use exactly these fields in this order on one line. Slots are `left`,
`right`, `bottom` or `overlay`. IDs start with a letter or underscore and
contain letters, digits, underscores, dots or hyphens. IDs must be unique.
Order is a signed decimal integer. Titles can contain spaces but no quotes,
backslashes or semicolons. Malformed markers fail configure with the file name.
Content changes rerun configure. Generated registrations compile directly
into each QML executable and use that file's URL within `NodeTool.Timeline`.
Discovery stays under `qml/`, so `src/app/example/` remains test-only.
Directories such as `qml/menus/` can also supply a `module.cmake`.

Compile registrars through `app` or `nt_qml_sources`, which compile directly
into executables. A registrar in a static library can be discarded by the
linker. Register extensions at startup, before dispatch or QML engine creation.

- `registerCliMode({flag, handler, stage})` adds an exact flag match. Dispatch
  scans arguments in order. The handler creates its own application object.
  `BeforeServerArgs` is for modes such as upload that consume `--server`
  themselves. Other modes run after the existing timeline-source processing.
- `registerDefaultStartup(handler)` installs one handler, refusing a second.
  With no positional source, `main.cpp` calls it with the existing application
  and parser. Return `StartupResult{exitCode}` to exit or
  `StartupResult{source}` to open a selected timeline through
  `loadTimelineSource`. The handler can show a list and run a local event loop
  while the selection is pending. Without a handler, startup shows help and
  exits with code 2.
- `registerEdit(name, function)` maps `(rawDocument, payload)` to a new raw
  document. Return the original object to refuse an edit. Call
  `TimelineModel::applyEdit` from C++ or QML. It owns undo, revision changes,
  incremental clip and marker updates, and re-derivation of other fields.
  `commitEdit` remains available to existing clip gestures.
  `overrideEdit(name, function)` takes precedence over `registerEdit` regardless
  of registration order. A second override of the same name is refused.
  Clip gestures and editing keys resolve these names through the registry,
  falling back to the built-in function when nothing is registered. Gestures
  preview live clips and commit one undo step on release.
- `registerPanel({slot, id, source, order, title})` supplies a QML URL to
  `left`, `right`, `bottom` or `overlay`. Side panels stack vertically, bottom
  panels horizontally, and overlays fill the editor. The QML component owns
  its natural dimensions. Equal orders preserve registration order.
  `PanelRegistry.forSlot(slot)` returns the descriptors.
- `registerMenuItem({kind, action, label, shortcut, enabled})` adds a context
  item. `MenuRegistry.query(kind, context)` evaluates its enabled predicate.
  An omitted predicate enables the item. Menu rendering belongs to package G.

Builtin edit names follow `EditActions.h`: `moveClip`, `moveSelectedClips`,
`splitClipAtTime`, `splitSelectedAtPlayhead`, `deleteSelected`,
`rippleDeleteSelected`, `trimClipStart`, `trimClipEnd`,
`rippleTrimClipStart`, `rippleTrimClipEnd`, `rollClipEdge`,
`resolveDropAction`, `rateStretchClip`, `slideClip`, plus `nudge`, `slipClip`,
`addMarker` and `deleteMarker`. Payload keys mirror the function arguments:
`clipId`, `selectedIds`, `deltaMs`, `toTrackId`, `linked` (default true),
`atMs`, `timeMs`, `edge`, `maxSourceDurationMs`, `durationMs`, `mode`, and
`sourceDeltaMs`. Nudge accepts either `deltaMs` or `frames` and uses the
raw document's FPS. Markers accept their raw fields. Delete uses `id`.

Inspector controls expose `commit` or `change` for final writes. A pill scrub
and a slider drag expose `gestureStarted` and `preview` separately, so a
consumer can preview without making an undo command per pointer movement.
Every started pill gesture ends with exactly one `commit(lastPreview)` on
release, cancellation or loss of keyboard focus, even when `preview` updates
`value`. Arrow stepping ends on key release or Escape. Typed drafts still
commit only when changed. Sliders likewise always emit their final `change`
on drag release, including when the consumer reflects previews into `value`.
`InspectorSection` forwards `checkedChangedByUser(next)` and exposes
`checkboxDisabled` for effect activation controls.
The helper oracle exercises the actual QML JS library through
`tst_inspectorprimitives --helpers`.

An oracle suite is a `scripts/conformance/suites/*.mjs` with a default export:

```js
export default {
  config: "vitest.config.mts", // or vitest.store.config.mts
  tests: ["/absolute/path/to/comparison.test.ts"],
  env: ({ bin }) => ({ CUSTOM_BINARY: bin }) // optional
};
```

The runner sets `NT_CONFORMANCE_TESTS`. Each requested file must load and
pass at least one comparison. Import errors, collection errors, failed tests,
and empty suites fail the aggregate result.

[example/module.cmake](example/module.cmake) and its adjacent files demonstrate
all extension points. Its registrations compile only into `tst_seamexample`.
The app and other tests receive none of the example's CLI modes, edits,
panels, menu items or QML resources.
