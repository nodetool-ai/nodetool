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
- `toolbarVariant`: receives `timeline`, `gestures`, `viewState`, `clock`, and `compact`.
  While an item reports a nonzero implicit width, it replaces the Timeline panel's tool row,
  so a layout can have its own toolbar (the Music toolbar). Report 0 to give the row back.
- `rulerOverlay`: receives `timeline`, `gestures`, and `viewState`. The item fills the
  ruler, is clipped to it, and draws in viewport coordinates (`x` is
  `ms / viewState.msPerPx - viewState.scrollLeftPx`). It takes no pointer input.
- `tracksFooter`: receives `timeline`, `gestures`, and `viewState`. The item spans the
  bottom of the Timeline panel under the scrollbar, and its implicit height comes off the
  lanes. Report 0 to take no space.
- `documentBar`: receives `timeline`, after Undo and Redo. Set implicit dimensions.
- `documentBarActions`: receives `timeline`, at the right end with 8 px padding. Set implicit dimensions.
- `preview`: receives `timeline` and `clock`, fills the preview frame, and is
  clipped to it. Coordinates start at the frame's top-left corner. The frame is the whole
  picture at its zoomed size, up to 1600% of the canvas, so it can be far larger than the screen.
  An item that paints (`QQuickPaintedItem`, `Canvas`) must cover only the `visibleItemRect` of the
  `monitor` property on its `PreviewArea` ancestor, as `TransformGizmoOverlay.qml` does, or it
  allocates the whole picture.
  Show controls hides this slot. The Hand tool disables its input.
- `trackLane`: receives the raw `track` map and `timeline`. Set `implicitHeight`
  in screen pixels. Contributions stack below the base lane and extend the row.
- `laneOverlay`: receives the raw `track` map, `timeline`, `gestures`, and `viewState`.
  The item fills the base lane above its clips, in lane coordinates (`x` is
  `ms / viewState.msPerPx`). Leave pointer input to the lane except on controls you draw.
- Playhead pass-through: add `property bool playheadPassthrough: true` to a pointer target, or define `playheadPassthrough(localPoint)` on a wrapper to hit-test its targets.
- Monitor views: `nt::ui::registerMonitorView({id, source, order, title})` from
  `ui/MonitorViewRegistry.h`. The view appears in the Program monitor's wrench menu under
  Display mode and in View > Monitor display, with no edit to `PreviewArea.qml`. Selecting it sets
  `monitor.displayMode` to `id`, and `composite` and `alpha` are reserved. The item fills the
  monitor over the picture and receives `timeline`, `clock`, `gestures` and `monitor`, a
  `MonitorViewState`, as initial properties, so declare them (`required` is allowed).
  The live picture is hidden, with no compositing cost, unless the item sets `readonly property bool
  keepsPicture: true`. It can then set `property rect pictureArea` in its own coordinates, which the
  picture fits into, as a comparison view does for its current frame. Zoom and pan apply to that
  picture and are off when the picture is hidden. Leave the view with
  `monitor.displayMode = "composite"`. C++ reaches the monitor with `MonitorViewState::current()`.
  A view that fails to load logs a warning and returns the monitor to Composite. Frames other
  than the live one come from `export/FrameCapture.h` and `OffscreenFrames`.
  `MonitorViewState` is view state: never write it to the document or undo.
- Reduced preview resolution: a scene with a group effect or a backdrop treatment (a stage that
  applies to a canvas-sized surface) composites at full size, because those stages take sizes in
  document pixels. A new stage on canvas-sized surfaces is covered through the same stage lists.
- Header actions: reuse
  `nt::tracks::registerHeaderAction({id, url, order})` from
  `edit/tracks/TrackHeaderActions.h`. Set implicit dimensions. This existing
  header slot does not inject properties.
- Context menus: `nt::app::registerMenuItem({kind, action, label, shortcut, enabled, group, order, checked, disabledReason, submenu, applies})`
  from `app/MenuRegistry.h`. Kinds are `clip`, `track`, `lane`, `ruler`, `asset`,
  `marker`, `gap`, and `editPoint`. A kind with no menu that queries it shows nothing.
  Context includes `kind`, `editable`, and the target's `clipId`, `trackId`, or
  `timeMs`. Clip context also includes the raw clip and selected IDs.
  Items of one `group` stay together with a separator between groups. Groups sort
  by their lowest `order`, items within a group by `order`, and equal orders keep
  registration order. Setting `checked` makes the item show a checkmark. `disabledReason` shows
  under the label while `enabled` is false. The menu shows the active preset's key for the action,
  else `shortcut`. The context also holds `gestures`, so a predicate can read the editor.
  `submenu` makes the item part of a clip menu submenu of that name, after `Label`, and a submenu
  with no enabled item is left out. In the clip menu, the groups `edit` and `state` join Split and
  Duplicate, and Lock and Enable, at the top of the menu. Set `applies` to leave an item out for a
  target it can never work on, such as a video command on an audio clip. A disabled item with a
  reason is for a target the person can change.
- Menu bar: `nt::app::registerShellMenuItem({menu, action, label, shortcut, submenu,
  group, order, enabled, checked, run, disabledReason})`, also from `app/MenuRegistry.h`.
  `app/Menus/StandardMenus.cpp` has the standard items as one table, and a new item is one
  row there when its action has no module of its own. `menu` is
  one of `File`, `Edit`, `Clip`, `Sequence`, `Markers`, `View`, `Playback`, `Window`,
  `Help`. Other names are refused. A menu with no items does not appear. `action`
  is unique among these entries, so a second entry for it is refused. Entries go
  before Settings in File. An enabled item must run, and a disabled one needs a
  `disabledReason`: `tst_menus` runs every item and fails on either. A group with a name starts after a separator. `submenu`
  adds one level. The shortcut shown is the active preset's binding, then the
  `registerKeyAction` default, then the entry's `shortcut`. The predicates and `run`
  receive `kind` (`"shell"`), and `gestures` and `timeline` when an editor is open, so they
  must handle both being absent. `enabled` and `checked` are read again each time a
  menu opens, and `enabled` again when the item runs. Without `run`, the item calls
  `gestures.runAction(action, context)`. Make an undoable `run` one `applyEdit` call.
- Key actions: `nt::wiring::registerKeyAction({name, label, defaultKeys, handler, group})`
  from `KeyActions.h`. Keys are single-chord `QKeySequence`s. The handler is
  `bool(ClipGestureController&, const QVariantMap&)`. A key the preset binds means that
  action alone, even when it refuses. A default key applies only where the preset uses
  neither that key nor another key for the action, and `shortcutFor` and the sheet follow the same
  rule. Keys for one preset go in `edit/KeymapOverlay.h`, which changes the generated table
  without editing `web/`, and need no default. Menus call the same
  `gestures.runAction(name, context)` dispatcher. Actions with a key appear in the shortcut
  sheet, in the sheet group named `group`, or in Extensions when it is empty. A handler that
  returns false must have changed nothing, because a key the Timeline refuses is offered again as
  it bubbles. `tst_keyboardpresets` fails on a binding with no handler and on a key bound twice.
- Snap: `nt::wiring::registerSnapProvider(id, provider)` from `SnapProviders.h`.
  Return millisecond candidates from a `SnapRequest` containing the document,
  visible range (scroll position plus viewport width), scale, grid division,
  ruler mode, and excluded clip IDs. Providers run once
  at gesture start. They are skipped while Snap is off or Alt bypasses it.
- Ruler: `nt::wiring::registerRulerProvider(mode, provider)` from
  `RulerProviders.h`. `src/ui/Tempo` registers `"bars"`, and the view state
  accepts `"time"`, `"bars"` and `"timecode"`. Return `{timeMs, major, label}` ticks from a `RulerRequest`
  containing the document, visible range, scale, rate, and grid division.
  `viewState.rulerMode` defaults to `"time"`, `gridDivision` to `"beat"`.
  The built-in `time` provider preserves the existing ticks. `RulerCanvas.ticks`
  exposes the list used for painting.
- Document fields: the protocol schema (`timelineMarker` and `timelineClip` in
  `packages/protocol/src/api-schemas/timeline.ts`) strips any field it does not list on
  save, so a new field goes there, in `packages/timeline/src/types.ts`, and in
  `src/server/FieldAudit.cpp`. All are optional. Marker `durationMs` (absent or 0 is a
  point marker) and `author`, and clip `audioRole` (`dialogue`, `music`, `sfx`, `ambience`)
  are in place. Clip `bypassedFixedEffects` holds what the Effect Controls switches of Motion,
  Opacity and Volume set aside, so the clip's own fields can stay at their identity and every
  renderer draws the bypass unchanged. Native code reads them from the raw document (`TimelineModel::markersJson`,
  `clipData`) and writes them with `applyEdit`, one call per user action.
- Workspaces: `DockLayout.js` has two lists. `workspaces` is the port of the web editor's
  list, and `dock-conformance.mjs` compares it. `nativeWorkspaces` holds Color and Audio,
  whose layouts come from `applyNativePreset`. Add a native-only preset there, and never to
  `workspaces`. Each preset names the panels it is for, so a new panel with the id `color` or
  `scopes` (Color), or `audio` (Audio), appears in place when it registers with
  `registerPanel`. No workspace needs editing. `nativeNeighbours` names the tab a native panel
  takes its place beside when a layout first meets it, and after a preset. A saved layout that
  already places the panel keeps it where it is. A preset's hidden list applies only to
  that preset, through `presetFromWorkspace`. `nativeHidden` lists a native panel that a ported
  preset would otherwise show, as Review does for `color`. `DockLayoutStore.workspaces` lists
  both, and `Alt+Shift+N` follows that order.
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
  gives the last frame. `captureDocument(raw, timeMs, callback)` renders a document other than the
  timeline's, built from `exportSnapshot`, such as one clip on its own. Capture changes no model,
  clock or undo stack. Show a frame with `FrameImage { image: frame }`, which draws it aspect-fit
  and nothing else, or set `stretch` to fill the item.
- Scopes: `ScopesController` (`colorpanel/ScopesController.h`) keeps trace images of the frame at the
  playhead while `active`, one capture at a time, on its own worker thread. For numbers, call
  `readNumbers(timeMs, options, callback)`, or `nt::scopes::readNumbers(signal, options)` on a frame
  you already hold. A reader needs only `capture` set. The maths is in `src/color`, and takes no Qt
  GUI thread.
