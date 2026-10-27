# Timeline extension points

Register contributions before creating the QML engine. Compile registrars with
`nt_sources(app ...)` or `nt_qml_sources(...)` in your module. QML under `qml/`
is discovered automatically. Other QML needs `nt_qml_files(...)`.

- Panels: `nt::app::registerPanel({slot, id, url, order, title})`, or
  `// nt-panel: slot=clipBody id=myPanel order=10 title="My panel"`.
  Slots accept `[a-z][A-Za-z0-9]*`. Refused registrations warn with the panel ID.
- `clipBody`: receives the raw `clip` map, `timeline`, `gestures`, and `viewState`.
  The item fills each clip body. Put pointer targets on the grips you draw.
- `toolbar`: receives `timeline`, `gestures`, `viewState`, and `compact`, after Snap.
  Set the item's implicit width and height for the horizontal layout.
- `documentBar`: receives `timeline`, after Undo and Redo. Set implicit dimensions.
- `documentBarActions`: receives `timeline`, at the right end with 8 px padding. Set implicit dimensions.
- `preview`: receives `timeline` and `clock`, fills the preview frame, and is
  clipped to it. Coordinates start at the frame's top-left corner.
- `trackLane`: receives the raw `track` map and `timeline`. Set `implicitHeight`
  in screen pixels. Contributions stack below the base lane and extend the row.
- Playhead pass-through: add `property bool playheadPassthrough: true` to a pointer target, or define `playheadPassthrough(localPoint)` on a wrapper to hit-test its targets.
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
  visible range (scroll position plus viewport width), scale, grid division,
  ruler mode, and excluded clip IDs. Providers run once
  at gesture start. They are skipped while Snap is off or Alt bypasses it.
- Ruler: `nt::wiring::registerRulerProvider(mode, provider)` from
  `RulerProviders.h`. `src/ui/Tempo` registers `"bars"`, and the view state
  accepts only `"time"` and `"bars"`. Return `{timeMs, major, label}` ticks from a `RulerRequest`
  containing the document, visible range, scale, rate, and grid division.
  `viewState.rulerMode` defaults to `"time"`, `gridDivision` to `"beat"`.
  The built-in `time` provider preserves the existing ticks. `RulerCanvas.ticks`
  exposes the list used for painting.
