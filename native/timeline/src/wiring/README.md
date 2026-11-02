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
- Context menus: `nt::app::registerMenuItem({kind, action, label, shortcut, enabled, group, order, checked})`
  from `app/MenuRegistry.h`. Kinds are `clip`, `track`, `lane`, `ruler`, `asset`,
  `marker`, `gap`, and `editPoint`. A kind with no menu that queries it shows nothing.
  Context includes `kind`, `editable`, and the target's `clipId`, `trackId`, or
  `timeMs`. Clip context also includes the raw clip and selected IDs.
  Items of one `group` stay together with a separator between groups. Groups sort
  by their lowest `order`, items within a group by `order`, and equal orders keep
  registration order. Setting `checked` makes the item show a checkmark.
- Menu bar: `nt::app::registerShellMenuItem({menu, action, label, shortcut, submenu,
  group, order, enabled, checked, run})`, also from `app/MenuRegistry.h`. `menu` is
  one of `File`, `Edit`, `Clip`, `Sequence`, `Markers`, `View`, `Playback`, `Window`,
  `Help`. Other names are refused. A menu with no items does not appear. `action`
  is unique among these entries. Entries go after the built-in items of their menu,
  and before Settings in File. A group with a name starts after a separator. `submenu`
  adds one level. The shortcut shown is the active preset's binding, then the
  `registerKeyAction` default, then the entry's `shortcut`. The predicates and `run`
  receive `kind` (`"shell"`), and `gestures` and `timeline` when an editor is open, so they
  must handle both being absent. `enabled` and `checked` are read again each time a
  menu opens, and `enabled` again when the item runs. Without `run`, the item calls
  `gestures.runAction(action, context)`. Make an undoable `run` one `applyEdit` call.
- Key actions: `nt::wiring::registerKeyAction({name, label, defaultKeys, handler, group})`
  from `KeyActions.h`. Keys are single-chord `QKeySequence`s. The handler is
  `bool(ClipGestureController&, const QVariantMap&)`. Existing preset bindings
  take priority. Unhandled keys try the registered defaults. Menus call the same
  `gestures.runAction(name, context)` dispatcher. Actions appear in the shortcut sheet,
  in the sheet group named `group`, or in Extensions when it is empty.
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
- Document fields: the protocol schema (`timelineMarker` and `timelineClip` in
  `packages/protocol/src/api-schemas/timeline.ts`) strips any field it does not list on
  save, so a new field goes there, in `packages/timeline/src/types.ts`, and in
  `src/server/FieldAudit.cpp`. All are optional. Marker `durationMs` (absent or 0 is a
  point marker) and `author`, and clip `audioRole` (`dialogue`, `music`, `sfx`, `ambience`)
  are in place. Native code reads them from the raw document (`TimelineModel::markersJson`,
  `clipData`) and writes them with `applyEdit`, one call per user action.
- Workspaces: `DockLayout.js` has two lists. `workspaces` is the port of the web editor's
  list, and `dock-conformance.mjs` compares it. `nativeWorkspaces` holds Color and Audio,
  whose layouts come from `applyNativePreset`. Add a native-only preset there, and never to
  `workspaces`. Each preset names the panels it is for, so a new panel with the id `color` or
  `scopes` (Color), or `audio` (Audio), appears in place when it registers with
  `registerPanel`. No workspace needs editing. A preset's hidden list applies only to
  that preset, through `presetFromWorkspace`. `DockLayoutStore.workspaces` lists both, and
  `Alt+Shift+N` follows that order.
- Licences: an algorithm ported from FilmCraft keeps its notice in
  `licenses/FilmCraft-MIT.txt`. The Linux and Windows packages copy `licenses/*.txt`. The macOS
  package copies named files, so a new file also goes in `scripts/package-macos.sh` and
  `scripts/check-package-macos.sh`.
- Frame capture: `FrameCapture` (`export/FrameCapture.h`) returns a composited frame or a
  source frame as a `QImage`, full resolution, with the same pixels as `--stills`. The work
  runs in a helper process (`--frame-server`) that stays open between requests and closes after
  60 s idle, so a cold capture costs a process start and a warm one a render. Use the
  editor's instance, the `frameCapture` property of `TimelineEditor`, found by walking
  `parentItem` as `DockKeyActions.cpp` does for `dockStore`. Calls are
  `captureSequence(timeMs)` and `captureSource(path, sourceTimeMs)`, with an optional C++
  callback. They return a request id at once, and exactly one of `frameReady`, `frameFailed` or
  `frameCancelled` follows later on the GUI thread. `cancel(id)` drops a frame nobody needs,
  so a scrubbing view cancels its previous request. Sequence frames read the document as it was
  at the request, so an edit made afterwards shows only in later requests. A source time past the end
  gives the last frame. Capture changes no model, clock or undo stack. Show a frame with
  `FrameImage { image: frame }`, which draws it aspect-fit and nothing else.
