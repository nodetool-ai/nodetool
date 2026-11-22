# Logic-style track automation: shared contract (AU)

Screenshot (read it first):
/private/tmp/claude-501/-Users-mg-workspace-nodetool/809e0820-c4db-42d4-8fd7-e46d090e6163/images/10.png

Copy the layout and behavior. Use our icon sets, theme tokens and UI primitives. Never copy
Apple artwork. Web and native must behave the same. The pure functions in AU9 have the same
names, rules and vectors on both surfaces.

## What exists today (both surfaces)

- Model (packages/timeline/src/types.ts): `track.automation?: AutomationLane[]`. A lane has
  `id`, `target` (`mixer` volumeDb/pan, `device` deviceId+param, `clip` property), `points`
  [{timeMs, value, easing?}] sorted by time, `enabled?`. Pure helpers in
  packages/timeline/src/automation.ts (`addAutomationPoint`, `moveAutomationPoint`,
  `removeAutomationPoints`, `setAutomationPointEasing`, `automationBreakpoints`,
  `createAutomationLane`, `findAutomationLane`, `isAutomationLaneActive`, ...).
- Targets and ranges: web `Tracks/automation/automationTargets.ts`, native
  `qml/Tracks/automation/automationTargets.js` (`automationTargetSpec`: label, group, min, max,
  lin/log curve, own value, format).
- View: a per-track header button opens Cubase-style lanes under the track
  (web `AutomationLaneView.tsx` + `AutomationLaneHeader.tsx`, native `AutomationLaneView.qml`,
  `AutomationLanes.qml`, `AutomationLaneHeader(s).qml`, `AutomationAddLaneHeader.qml`). The
  lane gestures (click adds a point and drags it, drag moves, Shift keeps time, double-click
  or Delete removes, right-click sets the easing, one undo step per gesture) stay as they are.

## AU1 Show Automation (global)

- One toggle `Show Automation` in the tracks-area toolbar (icon: a curve with two points).
  Off by default. In-memory UI state.
- No default shortcut: `A` is the track select tool in this app.
- On: every track that supports automation shows the automation header row (AU2) and the
  main-lane curve (AU3). Off: no automation UI at all.
- The per-track automation button in the track header goes away. Its job moves to AU1 + AU5.
- Web keeps the current rule that automation is Expert mode only.

## AU2 Track header automation row (Show Automation on)

A second row under the normal track header controls, left to right:
1. Disclosure triangle: opens or closes the sub-lanes (AU5). Points right when closed, down
   when open.
2. Mode select (AU6): `Off`, `Read`, `Touch`, `Latch`, `Write`. The select fill uses the
   mode color: Off = neutral/disabled, Read = success (green), Touch = warning (yellow),
   Latch = secondary/purple, Write = error (red).
3. Parameter select: every target of `automationTargetSpec`'s list for the track, grouped
   by `group` (Mixer first: Volume, Pan; then the instrument; then each effect). A target
   whose lane has points shows a dot before its label. The label text uses the parameter
   color (AU4). The choice is the track's "shown parameter": in-memory UI state per track.
   Default: the first lane that has points, else Volume (audio and midi tracks), else the
   first target in the list.
4. Value display: the value of the shown parameter at the playhead, formatted with the
   spec's `format`, in the parameter color. Read-only.

When Show Automation is on, a track is at least as tall as its header with this row.
The Logic `Track`/`Region` button is not built (D10).

## AU3 The curve on the main lane

- The track's main lane (where its clips are) draws the shown parameter's curve on top of
  the clips, over the full width of the track (the length of the project, like the
  existing lanes).
- Tint: the whole lane gets the parameter color at low alpha (about 12%). Clips under the
  curve are dimmed (about 40% toward the lane background) so the curve reads clearly.
- Curve: 1.5 px line in the parameter color. Points are dots (about 7 px) in the parameter
  color. A selected point is white with a ring in the parameter color. Mode Off or a
  disabled lane draws the line and dots in the disabled text color.
- Value label: at the left edge of the visible curve (the first point or the lane start,
  whichever is visible), a small label with the value at that x, like `+0.0 dB` in image 10.
  During a drag, the label follows the dragged point and shows its value.
- Height mapping: the same `automationValueToNorm` mapping and inset rule as the lanes, over
  the main lane's height.
- Pointer: the clip name bar (the top strip of a clip where its name is drawn) keeps every
  clip gesture (select, move, trim handles stay where they are). Everywhere else in the main
  lane, the pointer uses the lane gestures of today's lane view for the shown parameter.
- A parameter with no lane draws a flat line at the control's own value (`spec.value`).
  The first click on it creates the lane with two points: one at time 0 with the control's
  own value and one at the click (then drags it). One undo step.

## AU4 Parameter colors

- Volume: theme warning (yellow). Pan: theme success (green).
- Device and clip targets: a fixed rotation of theme accent colors (info, secondary,
  primary, error, then repeat), picked by the target's index in the track's target list.
- No raw color values. Web: theme palette. Native: Ui.Theme tokens.

## AU5 Sub-lanes (the disclosure triangle)

- Open: the existing Cubase-style lanes appear below the track, one per lane of the track
  except the shown parameter's lane, then the existing "add lane" row.
- Every sub-lane header uses the AU2 layout without the disclosure and the mode select
  (the mode is per track): a parameter select (changes that lane's target only when the
  new target has no lane yet, else it is disabled), and the value display.
- A sub-lane curve uses the AU3 style and colors (parameter color line and dots, tint).
- Open state: in-memory UI state per track. It only counts while Show Automation is on.

## AU6 Automation modes (document field)

- New optional track field `automationMode?: "off" | "read" | "touch" | "latch" | "write"`.
  Missing means `read`. Add it to `types.ts`, to the protocol zod schema
  (packages/protocol/src/api-schemas/timeline.ts) so PATCH keeps it, and to every native
  document read/write path so a round trip keeps it.
- Playback: `off` plays no lane of the track (the controls use their own values). `read`,
  `touch` and `latch` play the lanes as today. `write` plays the lanes too, except a target
  while a pass (AU7) records it.
- A mode change is one undo step.

## AU7 Recording passes (Touch, Latch, Write)

Scope: the mixer targets only (`volumeDb`, `pan`). Sources: every control that changes the
track's volume or pan through the store/edit path (mixer channel strip fader and pan, the
track header volume control where it exists). Recording happens only while the transport
plays. Device parameters do not record in this pass.

- Touch: a pass starts when the user presses the control (gesture start) and ends when the
  user releases it, or when the transport stops.
- Latch: a pass starts when the user presses the control and ends when the transport stops.
- Write: a pass for both volume and pan starts when the transport starts and ends when it
  stops. When the pass ends, the track mode changes to Latch.
- During a pass:
  - Record a sample {timeMs: playhead ms, value} at the pass start and at every control
    change. At the end, record the last value at the end time.
  - The recorded target does not follow its curve. The control keeps the user's value.
  - The control's own stored value (track volumeDb/pan) does not change.
- At the pass end, apply `writeAutomationPass` (AU9) to the target's lane (create the lane
  when it does not exist). One undo step per pass. Use `returnMs` = 200 and
  `toleranceRatio` = 0.005 of the target range.
- Stop or seek during a pass ends the pass at the playhead time before the move.

## AU8 State summary

- Document: `automationMode` per track (AU6) and the lanes (unchanged shape).
- In-memory UI: Show Automation, the shown parameter per track, the sub-lane open state per
  track, the point selection.

## AU9 Pure functions and vectors

Web: add to packages/timeline/src/automation.ts, exported from the package root, tests in
packages/timeline/tests/ (next to the existing automation tests). Native: the same names in
qml/Tracks/automation/ (a .js next to automationTargets.js) or C++, with the same vectors in
the native test suite.

- `automationModeOf(track)` -> the mode, `"read"` when missing.
- `automationModePlays(mode)` -> false for `"off"`, else true.
- `thinAutomationSamples(samples, tolerance)`: Ramer-Douglas-Peucker on [{timeMs, value}]
  with the perpendicular distance measured in value units against the straight line between
  the kept ends (distance = |value - linear value at that time|). Always keeps the first and
  the last sample. Fewer than 3 samples come back unchanged.
  Vector: ([0:0, 100:1, 200:2, 300:3, 400:0], 0.01) -> [0:0, 300:3, 400:0].
  Vector: ([0:5, 100:5], 0.01) -> [0:5, 100:5].
- `writeAutomationPass(points, pass, baseValue, returnMs, tolerance)`:
  pass = {startMs, endMs, samples} with samples sorted, inside [startMs, endMs].
  1. `after` = the old curve value at `endMs + returnMs` (old points, hold rules), or
     `baseValue` when the old lane has no points.
  2. Keep the old points with timeMs < startMs or timeMs > endMs + returnMs.
  3. Insert `thinAutomationSamples(samples, tolerance)` (no easing).
  4. Insert {timeMs: endMs + returnMs, value: after}.
  5. Sort by time (stable).
  Vector: points [], base 0, pass {1000, 2000, [1000:0, 1500:-6, 2000:-6]}, returnMs 200,
  tolerance 0.01 -> [1000:0, 1500:-6, 2000:-6, 2200:0].
  Vector: points [0:-3, 4000:-3], base 0, pass {1000, 2000, [1000:-3, 2000:-10]}, returnMs
  200, tolerance 0.01 -> [0:-3, 1000:-3, 2000:-10, 2200:-3, 4000:-3].
  Vector: points [0:0, 1100:-20, 1500:-20, 5000:0], base 0, pass {1000, 1200, [1000:-2,
  1200:-4]}, returnMs 200, tolerance 0.01 -> [0:0, 1000:-2, 1200:-4, 1400:x, 1500:-20, 5000:0]
  where x = the old curve value at 1400 = -20 (linear from 1100:-20 to 1500:-20).
- `automationParamColorRole(targetIndex, target)` -> "warning" for mixer volumeDb, "success"
  for mixer pan, else ["info", "secondary", "primary", "error"][targetIndex % 4]. Each surface
  maps the role to its theme token.

## Decisions

- D10: no `Track`/`Region` automation switch. Region automation needs per-clip automation
  data and engine support on both surfaces. MIDI clips already carry controller lanes
  (O6/O7), which are Logic's region automation for MIDI.
- D11: the value display is read-only.
- D12: after a Write pass the mode changes to Latch (Logic's default preference), so the
  next play does not erase the curve again.
- D13: recording covers volume and pan only in this pass.
