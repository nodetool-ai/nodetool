# Logic-style piano roll: shared contract (LP)

Reference screenshot: /private/tmp/claude-501/-Users-mg-workspace-nodetool/809e0820-c4db-42d4-8fd7-e46d090e6163/images/2.png
Read it before you start. Copy its layout and behavior. Use our own icon sets, our
theme tokens and our UI primitives. Never copy Apple artwork or icon glyphs.

The web surface and the native surface must behave the same. Every pure function
below has the same name, inputs and outputs on both surfaces, and both test suites
use the vectors listed in LP21.

## Layout

LP1 Toolbar (one row, replaces the current piano-roll toolbar row), left to right:
- Menus: `Edit`, `Functions`, `View` (text buttons with a chevron, see LP17).
- Toggle icon buttons, each with a tooltip and a pressed state:
  `Collapse Mode` (LP11), `MIDI Draw` (shows or hides the lane area under the grid),
  `MIDI Out` (LP14), `Catch` (LP12), `Link` (LP13).
  On-colors: MIDI Out uses the success color, Catch the primary/info color, Link
  the warning color (Logic: green, blue, yellow). Off = the normal icon button.
- Tool menus: the left-click tool and the Cmd-click tool (LP5). Each is a button
  with the current tool's icon and a chevron. The menu lists every tool with icon and name.
- Position display (monospace, LP15).
- `Snap:` label, a power toggle (snap on/off) and the snap value select (LP7).
- Drag mode menu (icon button, LP16).
- Vertical zoom slider and horizontal zoom slider, each with a small arrow icon (LP18).
- The existing Close (and phone Back) control stays at the far end. The clip name and
  note count leave the toolbar (the inspector header and region strip show the name).

LP2 Local inspector: a column at the left of the editor, left of the keyboard, full
editor height, scrolls when short. Visible by default; `View > Local Inspector` hides it.
On a phone-width panel it starts hidden. Sections, separated by dividers:
- a. Clip header: a MIDI icon tinted with the clip color, the clip name (label
  weight), and `on Track <track name>` (muted caption).
- b. `Time Quantize`: value select + `Q` button on one row. `Strength` label with the
  value right-aligned, then a slider 0..100. `Swing` label with the value, then a slider 0..100.
- c. `Scale Quantize`: root select (C, C#, D, ... B) + scale select on one row, then a
  `Q` button (disabled while the scale is Chromatic). A `Snap to Scale` checkbox.
- d. `Velocity`: label with the value right-aligned, then a slider 1..127 (LP10).
  Disabled when nothing is selected.
- e. `Note` (ours, keeps the tier-1 fields): MIDI channel and release velocity, with the
  existing "Mixed" handling. Web also moves its existing NoteSelectionInspector fields here.

LP3 Editor area: ruler with bar numbers; under the ruler a region strip (LP6); the
keyboard at the left with labels on C keys; the grid; the MIDI Draw lane area under the
grid (the existing velocity / controller / expression lanes and their selector, unchanged).

## Drawing

LP4 Notes:
- Default color = velocity color (`velocityColor`, LP21). `View > Note Color` offers
  `Velocity` (default) and `Clip` (the clip color for every note).
- Body: filled with the note color, 1 px border = note color mixed 35% toward black,
  corner radius 2 px.
- Velocity line: when the note is at least 8 px wide and 6 px tall, draw a 2 px
  horizontal line, centered vertically, from x+3 to x+3+round((w-6)*velocity/127),
  color = note color mixed 50% toward white.
- Selected and muted notes keep their current look (selection outline, muted style).

LP6 Region strip: a bar under the ruler, about 14 px tall, from the clip's first tick to
its last tick, filled with the clip color (track color when the clip has none; primary as
the last fallback). The clip name shows at the left end and right-aligned at the right
end, in a caption style that reads on the fill. The strip and the grid after the clip end
use the existing darker "outside" shade.

LP7 Grid and snap:
- Snap state is local to the piano roll (no longer the timeline grid division):
  `snapOn` (default true) and `snapValue` (default `smart`). Values: `Smart`, then the
  grid divisions the surface already offers (web GRID_DIVISION_OPTIONS, native the
  existing gridDivision values).
- `smart` step = `smartSnapTicks(pxPerTick, beatTicks, beatsPerBar)` (LP21).
- Snap applies to note create, move, resize, pencil, brush and scissors, as today.
- Grid lines: bar lines strong, beat lines medium, and lines at the effective snap step
  faint when it is finer than a beat. Skip a level whose spacing is under 4 px.
- Black-key rows stay a shade darker.

## Tools and modifiers

LP5 Tools. Defaults: left-click tool = Pointer, Cmd-click tool = Pencil.
- Pointer: click a note selects it (Shift toggles), drag moves, drag the right edge
  resizes, Option/Alt-drag duplicates, drag on empty grid draws a marquee. A click on
  empty grid clears the selection and creates NO note (behavior change: today a click
  creates a note).
- Pencil: click on empty grid creates a note one snap step long (velocity 100), and a
  drag right after the press sets its length. On an existing note it acts as Pointer.
- Eraser: click a note deletes it. A drag deletes every note the pointer passes over.
  One undo step per gesture.
- Brush: a drag paints notes at the row under the pointer, one per snap step
  (snapped start, one step long, velocity 100). A step that already has a note at that
  pitch gets no second note. One undo step per gesture.
- Scissors: click a note splits it at the snapped tick under the pointer (existing split
  function). No split when the tick is at or outside the note's ends.
- Glue: click a note -> `glueNotes(notes, selectedIds, clickedId)` (LP21).
- Mute: click a note toggles its mute. When the note is selected, all selected notes
  take the new state of the clicked note.
- Velocity: drag up/down on a note changes velocity by 1 per px (up = louder). When the
  note is selected, all selected notes shift by the same delta. Clamp 1..127. One undo step.
- Quantize: click a note quantizes it, or the whole selection when it is selected, with
  the inspector Time Quantize settings.
- Every tool gets a cursor that fits (crosshair for Pencil and Brush, and so on).

LP5m Modifiers:
- macOS: Cmd held at press = use the Cmd-click tool. Control held during a drag =
  bypass snap (this replaces today's Ctrl/Cmd snap bypass). Option = duplicate,
  Shift = additive selection (both unchanged).
- Windows/Linux: Ctrl held at press = use the second tool. No modifier bypasses snap
  (the Snap toggle does). Alt and Shift unchanged.
- Web: read the platform once (`navigator.platform`/`userAgent` contains "Mac").
  Native on macOS: Qt maps Cmd to `Qt.ControlModifier` and Control to `Qt.MetaModifier`.

## Functions

LP8 Time Quantize:
- Values: the six QUANTIZE_DIVISIONS, labeled `1/4 Note`, `1/8 Note`, `1/16 Note`,
  `1/32 Note`, `1/8 Triplet`, `1/16 Triplet`. Default `1/16 Note`. No "Grid" value.
- Strength default 100, Swing default 0 (sliders in %, passed as 0..1).
- `Q` button and the Q key: quantize the selection, or all notes when nothing is
  selected. Starts only (target `start`). Formula unchanged (packages/timeline
  `quantizeNotes`, grid phase as today).
- Choosing a new value while notes are selected quantizes them right away.
- `Functions > Quantize Starts and Lengths` = same settings with target `start_and_length`.
- Web: remove the toolbar Quantize button and settings popover (QuantizeControls) and
  their now-unused locale keys.

LP9 Scale Quantize:
- `snapPitchToScale(pitch, root, intervals)` (LP21). Chromatic = unchanged.
- `Q` applies `scaleQuantizeNotes` to the selection, or all notes when none. One undo step.
- `Snap to Scale` on: notes created by Pencil and Brush, and notes moved vertically, land
  on `snapPitchToScale` of their target pitch. A purely horizontal move never changes pitch.
- Scale list: Chromatic, then the scales in packages/timeline `harmony/scales.ts` SCALES,
  with readable title-case names. Default root: the document key if the model has one,
  else C. Default scale: Chromatic.

LP10 Velocity slider: shows the velocity of the earliest selected note (tie: list order).
Moving it shifts every selected note by (slider value - shown value), clamped 1..127.
Preview while dragging, one undo step on release.

LP11 Collapse Mode (default off): rows = `collapsedRows(committedNotes)`. The row set is
computed from committed notes, never from a drag preview. An empty clip shows normal
rows. The keyboard shows only those keys, each labeled with its note name. Pencil and
Brush create at the row's pitch. A vertical drag moves notes by row index (pitch = the
pitch of the target row, clamped to the first and last row). Arrow keys stay +/-1 semitone.

LP12 Catch (default on): while the transport plays, when the playhead tick is left of
the first visible tick or right of the last visible tick, set the scroll so the
playhead sits at 5% of the visible width (scroll >= 0). A horizontal scroll by the user
during playback turns Catch off.

LP13 Link (default on): on = the editor follows the MIDI clip selected in the timeline
(the existing follow behavior where it exists). Off = the editor stays on its clip.

LP14 MIDI Out (default on): on = the existing audition on click, create and move. Off =
no audition. If a surface has no single-note audition path, leave the button out and
report it. Do not build an audio path for it.

LP15 Position display: `<note>  <bar> <beat> <division> <tick>`.
- Pointer over the grid: the row's note name and the unsnapped position under the pointer.
- During a note drag: the dragged note's pitch and start. Otherwise the earliest selected
  note. Otherwise empty.
- bar = the bar number the piano-roll ruler shows for that tick. beat = 1-based beat in
  the bar. division = 1-based sixteenth in the beat. tick = 1-based tick in the sixteenth
  (1..240, MIDI_PPQ 960). Note names use the keyboard's naming convention.

LP16 Drag mode (default Overlap): `Overlap` = today. `No Overlap` = after a move or
resize commits, apply `applyNoOverlap(notes, movedIds)` (LP21) in the same undo step.

LP17 Menus. Each item shows its shortcut where one exists. Items that need a selection
are disabled without one, except Quantize and Scale Quantize, which use all notes.
- Edit: Undo, Redo | Cut, Copy, Paste, Delete | Select All, Deselect All, Select All
  Following, Select Same Pitch, Select Muted Notes, Invert Selection.
  Select All Following = notes that start at or after the earliest selected start (no
  selection: at or after the playhead). Select Same Pitch = all notes whose pitch is in
  the selection.
- Functions: Quantize, Quantize Starts and Lengths, Scale Quantize | Transpose Semitone
  Up, Semitone Down, Octave Up, Octave Down | Force Legato, Remove Overlaps, Delete
  Duplicates | Mute/Unmute.
- View: Local Inspector, MIDI Draw, Collapse Mode, Catch Playhead, Link | Note Color >
  Velocity / Clip | Zoom to Fit (fit all notes). Web also keeps Keyboard Shortcuts.

LP18 Zoom sliders: horizontal = pxPerTick on a log scale between the existing min and
max. Vertical = row height between 0.5x and 2x today's row height (default today's).
Wheel zoom keeps working and moves the slider.

LP19 State: every new setting is in-memory UI state, like the grid division today. It
resets on reload. Every note edit is one undo step through the existing write path
(web: the store edit path with validation; native: `root.write`).

LP20 Not copied: MIDI In (no MIDI input stack in either app), the small button beside
the region name (its function is unknown), non-destructive region quantize, the
"(classic)" label, and the Finger, Solo, Zoom, Marquee and Text tools.

## LP21 Pure functions and shared vectors

Web: `packages/timeline/src/midi/noteFunctions.ts`, exported from `midi/index.ts`, tests
in `packages/timeline/tests/midi.noteFunctions.test.ts`.
Native: the same names in `native/timeline/qml/pianoroll/PianoRollNotes.js`, tested where
PianoRollNotes.js is already tested. Notes are plain objects with id, pitch, startTick,
durationTick, velocity, channel (default 0), and the optional existing fields.
Every function returns a new list and keeps survivors in list order.

- `velocityColor(v)` -> [r, g, b]. Clamp v to 1..127. Stops (v: rgb):
  1: [110,91,216], 32: [62,123,224], 56: [63,180,200], 80: [108,191,78],
  100: [201,195,63], 114: [224,135,58], 127: [224,69,58].
  Linear per channel between neighbors, Math.round each channel.
  Vectors: 0 -> [110,91,216]; 1 -> [110,91,216]; 80 -> [108,191,78];
  90 -> [155,193,71]; 127 -> [224,69,58].
- `snapPitchToScale(pitch, root, intervals)`: the nearest pitch in 0..127 whose pitch class
  is in {(root + i) mod 12}; tie -> the lower pitch. Empty/12-tone intervals -> unchanged.
  Vectors, C major (0, [0,2,4,5,7,9,11]): 61 -> 60, 66 -> 65, 63 -> 62, 70 -> 69, 127 -> 127.
  G major (7, same intervals): 65 -> 64. A minor pentatonic (9, [0,3,5,7,10]): 66 -> 67, 65 -> 64.
- `scaleQuantizeNotes(notes, root, intervals, noteIds?)`: pitch -> snapPitchToScale for the
  listed notes (all when noteIds is absent).
- `smartSnapTicks(pxPerTick, beatTicks, beatsPerBar)`: candidates = unique of
  [bar = beatTicks*beatsPerBar, beatTicks, 480, 240, 120], sorted descending; return the
  smallest candidate with candidate*pxPerTick >= 16; when none qualifies, return bar.
  Vectors (beatTicks 960, beatsPerBar 4): 0.05 -> 480; 0.2 -> 120; 0.02 -> 960;
  0.01 -> 3840; 0.001 -> 3840.
- `collapsedRows(notes)` -> distinct pitches, descending. [60, 64, 60, 72] -> [72, 64, 60].
- `glueNotes(notes, selectedIds, clickedId)`: ids = selected + clicked. Group those notes by
  (pitch, channel). In each group with 2+ notes, the note with the earliest start (tie:
  list order) survives, with startTick = min start, durationTick = max end - min start,
  its own id, velocity, channel and other fields, and expression fitted to the new length.
  The rest of the group is removed.
  Vector: a(60, 0, 240, v100), b(60, 480, 240, v50), c(62, 0, 240), d(60, 960, 240);
  selected [a], clicked b -> [a(60, 0, 720, v100), c, d].
- `forceLegato(notes, ids)`: for each listed note, next = the smallest startTick among all
  notes (any pitch) with startTick > this start. If one exists, durationTick = next - start
  (expression fitted). Vector: a(60,0,100), b(64,480,100), c(67,480,200), d(60,1200,100),
  ids all -> a 480, b 720, c 720, d 100.
- `removeOverlaps(notes, ids)`: for each listed note, the nearest later note with the same
  pitch and channel that starts after this start and before this end -> durationTick =
  that start - this start. Vector: a(60,0,600), b(60,480,240), c(62,100,1000), ids [a, c]
  -> a 480, b 240, c 1000.
- `deleteDuplicates(notes, ids)`: remove each listed note when an earlier note in list order
  has the same pitch, channel and startTick. Vector: a(60,0), b(60,0), c(60,0,ch 1),
  d(62,0); ids [b, c, d] -> [a, c, d].
- `applyNoOverlap(notes, movedIds)`: for each moved note M and each not-moved note N with
  the same pitch and channel that overlaps M: N.start < M.start -> N.durationTick =
  M.start - N.start; N.start > M.start -> M.durationTick = N.start - M.start;
  N.start == M.start -> remove N. Expression fitted on every shortened note.
  Vectors: N(60,0,960), moved M(60,480,960) -> N 480, M 960.
  Moved M(60,0,960), N(60,480,240) -> M 480, N 240.
  Moved M(60,0,240), N(60,0,480) -> N removed.
