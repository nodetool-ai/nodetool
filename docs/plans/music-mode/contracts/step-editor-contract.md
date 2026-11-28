# O6 clip curves and O7 Step Editor: shared contract (SE)

Screenshots (read them first):
- Region types: /private/tmp/claude-501/-Users-mg-workspace-nodetool/809e0820-c4db-42d4-8fd7-e46d090e6163/images/7.png
  (the green "MIDI Region" shows a controller curve)
- Step Editor: /private/tmp/claude-501/-Users-mg-workspace-nodetool/809e0820-c4db-42d4-8fd7-e46d090e6163/images/8.png

Copy layout and behavior. Use our icon sets, theme tokens and UI primitives. Never copy
Apple artwork. Web and native must behave the same. The pure functions in SE9 have the
same names, rules and vectors on both surfaces.

Data (packages/timeline/src/types.ts): a MIDI clip has `notes` (MidiNote: id, pitch,
startTick, durationTick, velocity 1..127, channel, muted, ...) and optional `controllers`
(MidiControllerLane: id, kind "cc" | "pitchBend" | "channelPressure" | "polyPressure",
cc?, pitch?, channel?, interpolation "linear" | "step", points [{id, tick, value}]).
Ranges: `controllerValueRange(kind)` (pitch bend -8192..8191, others 0..127).
Curve value at a tick: `controllerValueAt` in packages/timeline/src/midi/controllers.ts.
Edits go through the existing helpers (controllerEdit.ts `setLanePoints`, the note write
path) and stay one undo step per gesture. Limits stay as they are (32 lanes per clip,
4096 points per lane: a refused add changes nothing).

## O6 Controller curve in a MIDI clip (tracks area)

SE0
- A MIDI clip on a track draws one controller curve over its note lines: the first lane
  in `controllers` list order that has at least one point.
- y: the lane value mapped into the clip body height by `controllerValueRange`.
- x: the same tick-to-position mapping the note lines use (trim and clip window respected).
- Shape: the lane's interpolation (step = horizontal then vertical segments, linear =
  straight segments), with the `controllerValueAt` rules before the first point and
  after the last point.
- Style: 1 px line, the note-line foreground color at 70% opacity. Notes stay as they are.

## O7 Step Editor

SE1 Placement
- Web: the clip editor panel gets an editor tab row at the top: `Piano Roll` | `Step Editor`.
  Default Piano Roll. The choice is in-memory UI state. Both tabs edit the same clip.
- Native: a new dock panel `Step Editor` that opens in the same dock group as the piano
  roll and edits the same clip (it follows the same Link rule as the piano roll).

SE2 Layout (image 8), left to right:
- Lane inspector (left column, can be hidden from View): a header `Clip: <name>`, a
  `Lane Set` select (SE3), then `Lane: <name>` and the parameters of the selected lane
  (SE4).
- Lane name column: one row per lane with the lane name and a small dot that marks the
  selected lane. A click on a row selects the lane.
- Event area: a ruler with bar numbers on top, then the lanes. Every lane row has the same
  height (the vertical zoom slider sets it). The selected lane row is a shade lighter.
- Toolbar: `Lanes`, `Edit`, `Functions`, `View` menus, then the `Catch` toggle
  (same rule and on-color as the piano roll), then the left-click and Cmd-click tool
  menus (SE6), the position display (same format as the piano roll), and the vertical and
  horizontal zoom sliders. Close/Back as the piano roll has them.

SE3 Lane sets
- `Automatic` (default) = `automaticLanes(clip)` (SE9): one note lane per used pitch,
  highest pitch first, then one lane per controller lane in list order.
- `GM Drums` = `GM_DRUM_LANES` (SE9), one note lane per entry, in that order.
- Lane names: a note lane = `<GM drum name>` when the pitch has one and the set is GM Drums,
  else the note name (keyboard convention of the piano roll). A controller lane = `Volume`
  (cc 7), `Modulation` (cc 1), `Pan` (cc 10), `Expression` (cc 11), `Sustain` (cc 64),
  `CC <n>` for other cc, `Pitch Bend`, `Channel Pressure`, `Poly Pressure <note>`.

SE4 Lane parameters (selected lane)
- `Grid`: 1/4, 1/8, 1/16, 1/32 Note, 1/8 and 1/16 Triplet (QUANTIZE_DIVISIONS). Default 1/16.
- `Pen Width`: beam width in px, 1..16, default 5.
- `Style`: `No Frames` (default, filled beams) or `Frames` (filled beams with a 1 px border).
- `Length` (note lanes only): the length of a note the editor creates, in ticks, default
  one grid step.
- `Status`: `Note`, `Control`, `Pitch Bend`, `Channel Pressure`, `Poly Pressure`, shown
  read-only. `MIDI Channel` (1..16) and `Number` (cc number or note pitch), shown read-only.
  A lane gets these when it is created (SE7) and keeps them.
- Grid, Pen Width, Style and Length are per-lane in-memory UI state. They do not change
  the document.

SE5 Drawing
- Controller lane: one beam per point at x = point tick. Height = (value - min) /
  (max - min) of the row height. Pitch bend draws from the zero line up or down instead.
- Note lane: one beam per note with that pitch (any channel) at x = note start, height =
  velocity / 127 of the row height. Muted notes use the muted style.
- Beam width = Pen Width px, starting at x. Beam color: the piano roll's velocityColor for
  note lanes; the theme primary color for controller lanes. A selected beam is lighter
  (mixed 50% toward white), like the highlighted beam in image 8.
- Faint vertical grid lines at the selected lane's grid step inside each lane row, bar lines
  stronger.

SE6 Tools (defaults: left-click = Pointer, Cmd-click = Pencil; modifiers as LP5m of the
piano roll contract: Cmd on macOS, Ctrl elsewhere)
- Pointer: click a beam selects it (Shift toggles). A drag on empty space draws a marquee
  over beams of the lane where the drag started. A vertical drag on a selected beam changes
  the value of every selected beam in that lane by one shared delta, limited so that no
  beam leaves its range (the piano roll velocity rule). Delete/Backspace removes the
  selected events. Option/Alt-drag is not used.
- Pencil: press and drag across a lane. For each grid step the pointer passes, apply
  `drawStep` with the value under the pointer (`valueFromY`). One undo step per gesture.
- Line: press, drag, release. On release, apply `lineSteps` from the press point to the
  release point, then `drawStep` for each step. A preview line shows during the drag.
- Eraser: click or drag removes every event whose beam the pointer touches, in the lane
  where the gesture started. One undo step per gesture.
- In a note lane, `drawStep` creates notes (lane pitch, channel 0, velocity = value,
  duration = the lane Length) or sets the velocity of the existing note at that step.

SE7 Menus
- Lanes: `New Controller Lane` (submenu: Volume, Modulation, Pan, Expression, Sustain,
  Pitch Bend, Channel Pressure, Other CC... asks for the cc number with a number field),
  `New Note Lane` (asks for the pitch), `Delete Lane` (a controller lane: removes the lane
  and its points from the clip after a confirm when it has points; a note lane: hides it
  from the Automatic set until the clip has notes at that pitch again, no document change).
  New controller lanes use `setLanePoints` with the existing uniqueness rules; a refused
  create shows the existing notice.
- Edit: Undo, Redo | Delete | Select All (in the selected lane), Deselect All.
- Functions: `Scale Values` (a dialog with a percent field, 0..200, applied to the selected
  events around the range minimum, clamped), `Set to Value` (a number field), `Thin Out`
  (removes every second selected event).
- View: `Lane Inspector`, `Catch Playhead`.

SE8 Selection, undo, state
- Selection is per editor and holds event ids (point ids and note ids).
- Every edit is one undo step through the existing write paths.
- Every new setting is in-memory UI state and resets on reload.

## SE9 Pure functions and vectors

Web: `packages/timeline/src/midi/stepEditor.ts`, exported from `midi/index.ts`, tests in
`packages/timeline/tests/midi.stepEditor.test.ts`. Native: the same names in a new
`native/timeline/qml/stepeditor/StepEditorModel.js` (or next to PianoRollLanes.js), tested
in the native test suite with the same vectors.

- `GM_DRUM_LANES`: [{pitch, name}] in this order: 36 Kick, 38 Snare, 40 Snare 2, 37 Side
  Stick, 39 Clap, 42 Closed Hi-Hat, 44 Pedal Hi-Hat, 46 Open Hi-Hat, 41 Low Tom, 45 Mid Tom,
  48 High Tom, 49 Crash, 51 Ride, 53 Ride Bell, 54 Tambourine, 56 Cowbell.
- `automaticLanes(notes, controllers)` -> [{type: "note", pitch} ... , {type: "controller",
  laneId} ...]. Note lanes: distinct pitches, highest first. Then controller lanes in list
  order. Vector: notes pitches [36, 42, 36, 38], one cc 7 lane "L1" ->
  [note 42, note 38, note 36, controller L1].
- `valueFromY(y, height, min, max)` = clamp(round(min + (1 - y / height) * (max - min)),
  min, max). Vectors: (0, 100, 0, 127) -> 127; (100, 100, 0, 127) -> 0; (50, 100, 0, 127)
  -> 64 (63.5 rounds up); (50, 100, -8192, 8191) -> 0 (-0.5 rounds to -0 -> report 0).
- `stepStartTick(tick, step, phase)` = phase + floor((tick - phase) / step) * step.
  Vector: (500, 240, 0) -> 480; (500, 240, 100) -> 340.
- `drawStep(points, stepStart, step, value, newId)` (controller lane): when a point has
  tick in [stepStart, stepStart + step), set the value of the first such point (lowest tick,
  tie: list order) and leave the others; else add {id: newId(), tick: stepStart, value}.
  Result sorted by tick (stable). Vectors: points [] , (480, 240, 90) -> [{tick 480, 90}];
  points [{a, 500, 10}, {b, 600, 20}], (480, 240, 90) -> [{a, 500, 90}, {b, 600, 20}].
- `drawNoteStep(notes, pitch, stepStart, step, velocity, length, newId)` (note lane): when a
  note with that pitch starts in [stepStart, stepStart + step), set its velocity (first by
  start, tie: list order); else append {id: newId(), pitch, startTick: stepStart,
  durationTick: length, velocity, channel: 0}. Velocity clamped 1..127.
- `lineSteps(t0, v0, t1, v1, step, phase)` -> [{tick, value}] for every step start s with
  stepStartTick(min(t0,t1)) <= s <= stepStartTick(max(t0,t1)), in ascending s; value =
  round(linear interpolation of the (t0, v0)-(t1, v1) line at s, clamped to the segment's
  ends when s is outside [t0, t1]); when t0 == t1, every value = v1.
  Vector: (0, 0, 960, 120, 240, 0) -> [0:0, 240:30, 480:60, 720:90, 960:120].
  Vector: (100, 10, 500, 50, 240, 0) -> [0:10, 240:24, 480:48].
- `scaleValues(values, percent, min)` -> round(min + (v - min) * percent / 100), then clamp
  to [min, max] by the caller. Vector: ([20, 60, 100], 50, 0) -> [10, 30, 50].
- `thinOut(ids)` -> the ids to remove: every second id in tick order, starting with the
  second. Vector: [a, b, c, d, e] -> [b, d].
