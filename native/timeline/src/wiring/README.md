# Timeline extension points

Register contributions before creating the QML engine. Compile registrars with
`nt_sources(app ...)` or `nt_qml_sources(...)` in your module. QML under `qml/`
is discovered automatically. Other QML needs `nt_qml_files(...)`.

- Panels: `nt::app::registerPanel({slot, id, url, order, title})`, or
  `// nt-panel: slot=clipBody id=myPanel order=10 title="My panel"`.
  Slots accept `[a-z][A-Za-z0-9]*`. Refused registrations warn with the panel ID.
- `clipBody`: receives the raw `clip` map, `timeline`, `gestures`, and `viewState`.
  The item fills each clip body. Put pointer targets on the grips you draw.
- `toolbar`: receives `timeline`, `gestures`, and `viewState`, after Snap.
  Set the item's implicit width and height for the horizontal layout.
- `documentBar`: receives `timeline`, after Undo and Redo. Set implicit dimensions.
- `preview`: receives `timeline` and `clock`, fills the preview frame, and is
  clipped to it. Coordinates start at the frame's top-left corner.
- Header actions: reuse
  `nt::tracks::registerHeaderAction({id, url, order})` from
  `edit/tracks/TrackHeaderActions.h`. Set implicit dimensions. This existing
  header slot does not inject properties.
- Menus: `nt::app::registerMenuItem({kind, action, label, shortcut, enabled})`
  from `app/MenuRegistry.h`. Kinds are `clip`, `track`, `lane`, and `ruler`.
  Context includes `kind`, `editable`, and the target's `clipId`, `trackId`, or
  `timeMs`. Clip context also includes the raw clip and selected IDs.
- Key actions: `nt::wiring::registerKeyAction({name, label, defaultKeys, handler})`
  from `KeyActions.h`. Keys are single-chord `QKeySequence`s. The handler is
  `bool(ClipGestureController&, const QVariantMap&)`. Existing preset bindings
  take priority. Unhandled keys try the registered defaults. Menus call the same
  `gestures.runAction(name, context)` dispatcher. Actions appear in the shortcut sheet.
- Snap: `nt::wiring::registerSnapProvider(id, provider)` from `SnapProviders.h`.
  Return millisecond candidates from a `SnapRequest` containing the document,
  visible range, scale, grid division, and excluded clip IDs. Providers run once
  at gesture start. They are skipped while Snap is off or Alt bypasses it.
- Ruler: `nt::wiring::registerRulerProvider("bars", provider)` from
  `RulerProviders.h`. Return `{timeMs, major, label}` ticks from a `RulerRequest`
  containing the document, visible range, scale, rate, and grid division.
  `viewState.rulerMode` defaults to `"time"`, `gridDivision` to `"beat"`.
  The built-in `time` provider preserves the existing ticks. `RulerCanvas.ticks`
  exposes the list used for painting.

## Blocked track-lane rows

`trackLane` has no host yet. It needs an unowned change in
`src/model/TrackWindowModel.h` and `.cpp`: add a writable, notifying
`QVariantMap extraRowHeights` property keyed by track ID and a `baseRowHeight`
role. Keep `baseRowHeight = authoredHeight * verticalZoom`. Include the extra
height in `rowHeight`, row tops, content height, and the virtualization window.
Relayout and notify the affected roles when the extra-height map changes.

Then `TracksRegion` can place a base-height `TrackLane` and a `SlotItems` host
below it in a wrapper whose height is the total `rowHeight`. Each contribution
receives `track` and `timeline`. Report the host's measured height through
`extraRowHeights`. Headers keep the base height and the following row starts
after the contributions. No rows overlap or share the base lane's height.
