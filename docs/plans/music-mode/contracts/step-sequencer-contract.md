# Step Sequencer: shared contract (SQ)

Target: parity with the Logic Pro Step Sequencer (manual pages 724 to 760, key
commands 1177 to 1180 and 1197 to 1198). Source notes and figures:
`/private/tmp/claude-501/-Users-mg-workspace-nodetool/809e0820-c4db-42d4-8fd7-e46d090e6163/scratchpad/logic-manual/3-step-sequencer-full.md`
and its folder `3-step-sequencer-full/`. Read `p0724-fig01` (grid and row headers),
`p0736-fig01` (subrows and value display) and `p0757-fig01` (Step inspector) before UI work.

Copy layout and behavior. Use our icon sets, theme tokens and UI primitives
([DESIGN.md](../../../DESIGN.md), [MUSIC_EDITOR_UI.md](../../../design/MUSIC_EDITOR_UI.md),
[native DESIGN.md](../../../../native/ui_primitives/DESIGN.md)). Never copy Apple artwork.
Web and native behave the same. Every pure function in SQ60 has the same name, rules
and vectors on both surfaces. Every edit a person can make has an agent op (SQ50 to SQ58).

Each item ends with **Test:**, the acceptance statement the implementer turns into a test.
Decisions are D70 to D104 and D106 at the end. Decisions marked **(confirm)** wait for the user.

## What exists (do not rebuild)

- MIDI clips: `TimelineClip` with `mediaType: "midi"`, `notes: MidiNote[]`,
  `controllers: MidiControllerLane[]`, CE3 `loopLengthMs`, CE6 `transpose`,
  `velocityOffset`, `quantize` (packages/timeline/src/types.ts). MIDI_PPQ = 960.
- The track owns the instrument (`TimelineTrack.instrument`). `DrumMidiInstrument` (DR-1)
  has 16 named `pads`, pad i answers to `baseNote + i`. Sampler kits map keys to assets.
- Ops: packages/timeline/src/ops (op.ts, parse.ts, apply.ts, serialize.ts), contracts in
  packages/protocol/src/api-schemas/timeline-tool-contracts.ts and timeline-tool-params.ts,
  headless tools in packages/agents/src/capabilities/timeline-bridge.ts (`sharedTool`,
  `editOp`), the op list in timelines.specs.ts, the browser tool in
  web/src/lib/tools/builtin/timeline.ts, parity in packages/agents/tests/timeline-op-parity.test.ts,
  native tools in native/timeline/src/music/MusicAssistant.cpp, the native oracle in
  native/timeline/src/music/music-oracle.test.ts. `join_clips` is the model to copy.
- Harmony: `chordTrackFor`, `SCALES`, `remapNote`, `stepRandom` (packages/timeline/src/harmony/).
- The Step Editor (SE contract) is a different editor: event beams per lane over a MIDI
  clip. It stays. GM_DRUM_LANES (SE9) is reused here.

## A. Data model

SQ1 Pattern region
- A pattern region is a MIDI clip with a `pattern: StepPattern` field (D71). Its `notes`
  and `controllers` are not stored. Every renderer derives them with `expandPattern` (SQ60).
- A clip with `pattern` and stored `notes` is invalid. The validator names the clip.
- Create: track context menu `Create Pattern Region` on a MIDI track (empty space), the
  op `create_pattern_region`. A new region is 1 bar long and starts on the clicked bar.
- **Test:** a document with a pattern region round-trips through serialize and parse with
  no change, and the validator refuses a clip that holds both `pattern` and `notes`.

SQ2 StepPattern fields (pattern level). Defaults in parentheses.
- `version` (1), `seed` uint32 (random at creation, D78), `lengthSteps` 1..64 (16),
  `stepRate` (`"1/16"`), `playback` (`"forward"`), `legato` (false), `swing` 0..100 (0),
  `swingDivision` `"1/8"` | `"1/16"` (`"1/16"`), `pitchSource` `"off"` | `"key"` |
  `"chords"` (`"off"`), `key` {tonic 0..11, mode} (absent = C major), `scale` a SCALES id
  or `"chromatic"` (`"chromatic"`), `noTranspose` (false), `scaleQuantize` (false),
  `midiChannel` 1..16 (1), `automationMode` `"latch"` | `"slide"` (`"latch"`), `mono`
  (false, D96), `name` string (`"Pattern"`), `rows: StepRow[]` (empty).
- Pattern-level `stepRate`, `playback`, `midiChannel`, `automationMode` and loop start and
  end write through to every row when set from the Pattern inspector or the menu bar, as
  in Logic (p. 754 to 755). New rows take the pattern values.
- **Test:** `normalizePattern({})` returns exactly the defaults above, and setting the
  pattern step rate to `"1/8"` sets every row's `stepRate` to `"1/8"`.

SQ3 StepRow fields
- `id`, `assignment` (SQ4), `name` (absent = the assignment label), `color` (absent = the
  track color), `mute` (false), `solo` (false), `lengthSteps` 1..64 (the pattern length),
  `loopStart` 0-based (0), `loopEnd` exclusive (the row length), `stepRate` (pattern rate),
  `playback` (pattern mode), `midiChannel` (pattern channel), `automationMode` (pattern
  mode), `subrows` the edit modes shown under the row (SQ8), `steps: Step[]` with exactly
  `lengthSteps` entries.
- At most 128 rows per pattern. A refused add changes nothing and names the limit.
- **Test:** adding a row to a 16-step pattern creates 16 off steps, and the 129th add is
  refused with the limit in the error.

SQ4 Row assignment (row types)
- `{type: "note", pitch 0..127}` fixed pitch. Label: the GM drum name when the track
  instrument is not melodic and GM_DRUM_LANES has the pitch, else the note name (C3 = 60).
- `{type: "melodic", pitch}` default pitch 60. Subrows Note and Octave are shown by default.
- `{type: "kit", pad 0..15}` only on a DR-1 or Sampler kit track. Label: the pad name.
- `{type: "degree", degree "root" | "2nd" | "3rd" | "4th" | "5th" | "6th" | "7th", octave
  -2..8}` only when `pitchSource` is `"chords"` (SQ19). Label `Root : 3`.
- `{type: "automation", target}` (SQ41). Label: the target name (`Volume`, `CC 74`,
  `Cutoff`).
- A fixed `note` row becomes `melodic` when a step's Note or Octave value changes (p. 734).
- **Test:** on a DR-1 track the Add Row menu lists the 16 pad names, and an edit of a Note
  value on a `note` row turns it into a `melodic` row with the same base pitch.

SQ5 Step fields. Each field is optional. Absent means the default (D77).
- `on` (false), `velocity` 1..127 (100), `gate` 1..100 percent (100, D76), `tie` (false,
  "continues the note of the previous step", D75), `note` -12..12 semitones (0),
  `octave` -2..8 absolute (the row pitch octave, D80), `repeat` 1..16 (1), `chance`
  0..100 (100, D79), `offset` -50..50 percent of the step (0), `stepRate` (absent =
  inherit the row rate, D101), `skip` (false), `value` (automation rows, the target range,
  default the target default), `condition` `{type: "always"}` | `{type: "recurrence",
  iteration 1..cycles, cycles 2..16}` | `{type: "first"}` | `{type: "last"}` (always),
  `midiChannel` 1..16 (row channel), `articulation` 0..255 (0, D93), `velocityRamp`
  -100..100 (0), `velocityCurve` -100..100 (0), `distribution` -100..100 (0).
- Stored steps omit default values, so a template is small and diffs are readable.
- **Test:** `normalizeStep({})` returns the defaults above, and `compactStep` of a step
  equal to the defaults returns `{}`.

SQ6 Step rates
- Values (p. 732): `"4"`, `"2"`, `"1"`, `"1/2"`, `"1/4"`, `"1/8"`, `"1/16"`, `"1/32"`,
  `"1/64"`, triplets `"1T"`, `"2T"`, `"4T"`, `"8T"`, `"16T"`, `"32T"`, dotted `"1D"`,
  `"2D"`, `"4D"`, `"8D"`, `"16D"`, `"32D"`, `"64D"`. `"4"` is four whole notes.
- `stepRateTicks(rate)` returns integer ticks at MIDI_PPQ 960 (SQ60 vectors).
- Increment and decrement walk this list in tick order.
- **Test:** `stepRateTicks("1/16") = 240`, `("16T") = 160`, `("8D") = 720`, `("4") = 15360`.

SQ7 Pattern length and pages
- The Length menu has sections `4 Based`, `3 Based`, `5 Based`, `7 Based` with the
  multiples of 4, 3, 5 and 7 up to 64 (p. 731). Agents can set any value 1..64.
- A longer length fills the new steps by repeating the existing steps from step 0
  (p. 732). A shorter length drops the tail and keeps it in an undo entry only.
- A row's `lengthSteps` follows the pattern length when they were equal before the change.
  A shorter row stays shorter. A row longer than the new length is cut.
- Page = 16 steps (D89). Page overviews show when the grid does not show the whole pattern
  at the current zoom.
- **Test:** length 4 with steps [on, off, on, off] set to 8 gives [on, off, on, off, on,
  off, on, off], and a row of length 12 stays 12 when the pattern goes from 16 to 32.

SQ8 Edit modes and subrows
- Modes: `onOff`, `velocity` (note rows, shown as `Velocity/Value`), `value` (automation
  rows, same menu entry), `gate`, `tie`, `note`, `octave`, `repeat`, `chance`, `offset`,
  `stepRate`, `skip`, `loop` (Loop Start/End).
- The global edit mode applies to every row. A row can show subrows, each with one mode.
  Two subrows of one row cannot share a mode (p. 735).
- Default subrows per row type: note and kit = Velocity, Gate. Melodic = Note, Octave.
  Degree = Velocity, Octave. Automation = Value.
- Subrow sets and expansion state are document data (they travel with templates, p. 725).
- **Test:** adding a subrow picks the next mode not used by the row, and setting a second
  subrow to a used mode is refused.

## B. Playback and render

SQ9 One expansion for every renderer
- `expandPattern(pattern, ctx)` returns `{notes, controllers}` in clip content ticks for
  the clip window and its loop repeats. `ctx` = {clipLengthTicks, loopLengthTicks?,
  patternPhaseTicks, chords, key, instrument}. It is pure and deterministic.
- Web playback, the server export (packages/timeline MIDI events path, events.ts) and the
  note-line drawing call it. The MIDI cache key includes a hash of the pattern.
- Native: a C++ port `PatternExpand` in native/timeline/src/midi/ with the SQ60 vectors,
  checked by the native oracle against the TS function (D104).
- **Test:** for the 12 oracle patterns in SQ60, web, server export and native produce the
  same note lists (pitch, startTick, durationTick, velocity, channel), byte for byte.

SQ10 Row timing
- A row plays the steps in `[loopStart, loopEnd)`. A skipped step takes no time (p. 734).
  A step's length is `stepRateTicks(step.stepRate ?? row.stepRate)`.
- The row cycle length is the sum of the lengths of the steps it plays in one cycle.
  Ping-Pong and Pendulum change the cycle (SQ11).
- The pattern musical length = the least common multiple of the row cycle lengths, capped
  at 64 bars for display. Random rows do not count (p. 731).
- Rows restart at the start of each region loop repeat and at the clip start (p. 731).
- **Test:** rows of 16 x 1/16 and 12 x 1/16 have a musical length of 3 bars in 4/4, and a
  skipped step shortens its row cycle by its own length.

SQ11 Playback modes (row and pattern)
- `forward`, `backward` (named Reverse in key commands), `pingPong` (first and last steps
  repeat), `pendulum` (no repeat at the ends), `wander` (each step moves left or right at
  random, wrapping), `shuffle` (a new permutation each cycle), `random` (each step position
  at random, independent).
- Random choices use `stepHash` (SQ13) with the cycle index, so a playback is repeatable.
- **Test:** steps a b c d give `pingPong` a b c d d c b a, `pendulum` a b c d c b, and the
  same seed gives the same `shuffle` order on web and native.

SQ12 Note generation per played step
- A step plays when `on`, not `skip`, not muted (row mute, or another row has solo), its
  condition passes and its chance passes.
- Pitch: SQ18 (key, scale, degree) after the row pitch, `note` and `octave`. Velocity:
  `velocity`. Channel: step, else row, else pattern channel, as `MidiNote.channel` (0-based).
- Start: step start + swing (SQ14) + `round(offset / 100 * stepTicks)`. A start below 0 at
  the clip start is clamped to 0.
- Duration: a tie chain starts at a step without `tie` and runs through the following
  played steps that have `tie`. Duration = the sum of the chain step lengths except the
  last + `round(lastLength * gate / 100)` of the last step, minimum 1 tick.
- Legato: a step with gate 100 lasts 1 tick more, so it overlaps the next step (p. 755).
- A tied step's own `on`, `velocity` and `note` do not start a new note.
- **Test:** a 1/16 step with gate 50 gives duration 120, three steps tied with gate 100 give
  720, and legato turns a 240-tick gate-100 note into 241 ticks.

SQ13 Chance and conditions (deterministic)
- `stepHash(seed, rowIndexKey, stepIndex, cycle)` = mulberry32 of a 32-bit FNV-1a hash of
  the four integers (row key = the FNV-1a of the row id). The value is in [0, 1).
- The step plays when `stepHash(...) * 100 < chance`. Chance 100 always plays, 0 never.
- `cycle` counts pattern passes from the clip start (0-based), across loop repeats.
- `recurrence`: plays when `cycle % cycles == iteration - 1`. `first`: cycle 0. `last`:
  the last pass that starts inside the clip duration.
- Re-seed: the `seed` field and the `set_pattern_seed` op. Chance does not change when a
  person edits other steps.
- **Test:** chance 50 over 1000 cycles plays between 450 and 550 times, the same document
  gives the same hits on web, server and native, and changing `seed` changes them.

SQ14 Swing
- Applies to step starts that fall on an odd multiple of the swing division (1/8 = 480
  ticks, 1/16 = 240 ticks), measured from the pattern start.
- Delay = `round(divisionTicks * swing / 200)` (D82). Swing 100 delays by half a division.
- **Test:** 1/16 swing 50 moves the step at tick 240 to 300 and leaves 0 and 480 in place.

SQ15 Note repeat
- `repeat` N > 1 plays N notes inside the step length T. Positions p_k = round(T *
  (k / N) ^ e) with e = 2 ^ (-distribution / 100), k = 0..N-1. Positive distribution gives
  longer gaps at the start (accelerando, p. 758).
- Each sub-note lasts `round((p_{k+1} - p_k) * gate / 100)`, minimum 1, p_N = T.
- Velocity: v_k = clamp(round(v * (1 + velocityRamp / 100 * x ^ c)), 1, 127) with x =
  k / (N - 1) and c = 2 ^ (velocityCurve / 50). Negative ramp fades, positive swells.
- A tied step with repeat > 1 repeats inside the full chain length.
- **Test:** T 240, N 4, distribution 0 gives starts 0, 60, 120, 180, and ramp -100 on
  velocity 100 gives 100, 67, 33, 1.

SQ16 Automation rows at render
- See SQ41. Off steps emit no value (p. 740). Latch = a held value (`interpolation:
  "step"`), Slide = a linear ramp to the next played value (`"linear"`).
- **Test:** a CC 74 row with values 0, off, 127, off in latch mode emits points at 0 (0)
  and 480 (127) with step interpolation.

SQ17 Region length, loop and region params
- Pattern longer than the clip: playback stops at the clip end. Clip longer: the pattern
  repeats. CE3 loop: the pattern restarts at every repeat (p. 731).
- CE6 `transpose`, `velocityOffset` and `quantize` apply to the expanded notes, in that
  order, exactly as for a MIDI clip.
- **Test:** a 1-bar pattern in a 3-bar clip plays three times, and transpose +2 raises
  every expanded note by 2 semitones.

SQ18 Pitch source, key and scale
- `off`: pitch from the row and steps, then the pattern key and scale. `key`: the project
  key (`tempo.key`). `chords`: degree rows take the chord at the step start from
  `chordTrackFor` (CH contract). Example: root, 3rd, 5th over G play G, B, D (p. 741).
- Key change: steps transpose by the interval to the new key unless `noTranspose`.
- `scaleQuantize`: every played pitch moves to the scale with `remapNote` (ties go down).
  The `Q` button shows active when a stored pitch falls outside the scale (p. 755).
- A degree row with no chord at the step plays nothing.
- **Test:** pattern key C to D transposes a C3 step to D3, and `noTranspose` keeps C3.

SQ19 Degree rows
- Available in Add Row and Row Assignment only when `pitchSource` is `"chords"`.
- `7th` over a triad plays the chord's natural 7th from the scale of the chord quality.
- **Test:** rows root, 3rd, 5th over E minor play E, G, B.

## C. Conversion

SQ20 Pattern to MIDI (`convert_pattern_to_midi`)
- Writes `expandPattern` output into `notes` and `controllers` and removes `pattern`. The
  clip id, window, loop and CE6 fields stay. One undo step.
- Chance, conditions and random modes resolve with the stored seed, so the MIDI clip sounds
  the same as the pattern did.
- Menu: clip context menu `Convert > Convert to MIDI Region`. The piano roll on a pattern
  clip shows a read-only view with the same command as a button (D86).
- **Test:** a converted clip renders the same audio samples as the pattern clip before.

SQ21 MIDI to pattern (`convert_midi_to_pattern`)
- Step rate 1/16 by default (op arg `stepRate`). Pattern length = ceil(clip length / step),
  max 64. Notes past 64 steps are dropped and the result reports the count.
- One row per distinct pitch, highest first. A DR-1 or kit track maps pitches to kit rows.
- Each note turns on the nearest step. The rest goes to `offset` (clamped to -50..50).
  Length: whole steps become a tie chain, the rest becomes the last step's gate (p. 746).
  Velocity and channel copy. Two notes on one row and one step keep the louder one and the
  result reports the count.
- Controller lanes become automation rows (one value per step, the lane value at the step
  start, steps on where the lane has a point in the step).
- **Test:** a 1-bar four-on-the-floor kick converts to one row with steps 0, 4, 8, 12 on,
  and converting it back gives the original notes.

SQ22 Separate by row (`separate_pattern_rows`)
- One new MIDI track per row under the source track, same instrument, each holding a
  one-row pattern region with the source window. The source region is removed. One undo
  step (D91). Kit tracks name the new tracks after the pads.
- **Test:** a 4-row pattern gives 4 tracks with one row each, and the mix renders the same.

## D. Clip editing interaction

SQ23 Split (`split_clip`, CE1)
- Splitting a pattern region gives two pattern regions with a copy of the pattern. The
  right clip gets `patternPhaseTicks` = the cut position in content ticks, so it continues
  the pattern mid-cycle and the sound does not change. Cycle counting continues too.
- **Test:** split at beat 3 of a 1-bar pattern renders the same notes as before the split.

SQ24 Join (`join_clips`, CE5)
- Two pattern regions with equal patterns (ignoring `patternPhaseTicks`) that touch join
  into one pattern region. Any other join that includes a pattern region converts each
  pattern region to MIDI first (SQ20) inside the same undo step and reports it.
- **Test:** joining a pattern region with a MIDI clip gives one MIDI clip whose notes equal
  both expansions.

SQ25 Loop, duplicate, move, trim, paste_range, section edits
- `loop_clip`, `duplicate_clip`, `move_clip`, `trim_clip`, `paste_range`, `insert_time`,
  `delete_time` and `duplicate_range` carry `pattern` and `patternPhaseTicks` unchanged.
  A section edit that cuts a pattern region uses SQ23.
- Trim from the left raises `patternPhaseTicks` by the trimmed ticks, so the remaining
  steps stay where they were in time.
- **Test:** `paste_range` of a range that holds a pattern region gives an equal pattern in
  the copy, and a left trim by one beat keeps the third step at the same timeline time.

SQ26 CE6 region params
- The Region inspector shows Transpose, Velocity and Quantize for pattern regions too.
  Pattern velocity values in the grid stay the stored values. A badge marks an active param.
- **Test:** `set_clip_params` with `velocityOffset: -20` lowers the rendered velocities by
  20 and leaves the stored step velocities unchanged.

## E. Editor surface

SQ27 Placement
- Web: the clip editor tab row gains `Step Sequencer`. It is the default tab for a pattern
  region. Piano Roll and Step Editor tabs show the read-only view with the convert button.
- Native: a dock panel `Step Sequencer` in the editor dock group, same Link rule as the
  piano roll. Key `Cmd-3` (Ctrl-3) opens it for the selected region.
- **Test:** selecting a pattern region in the tracks area opens the Step Sequencer tab on
  web and the panel on native.

SQ28 Menu bar, left to right (figure p0724)
- `Edit`, `Functions`, `View` menus, Pattern Browser toggle, Inspector toggle, MIDI In
  (step record), MIDI Out, Mono Mode, the edit mode selector (`On/Off` button plus the mode
  select, p. 735), Live Pattern Recording, Preview, then the vertical zoom slider, Vertical
  Auto Zoom, and the Step Width buttons (min, max).
- Second bar: Add Row menu (or the Learn button, SQ38), pattern step rate select, pattern
  playback mode select, pattern rotate left/right, pattern decrement/increment, pattern
  randomize, pattern clear, the pattern name, page overviews, the Length select.
- On-colors follow the piano roll contract (MIDI Out = success, Learn Add = error red,
  Learn Assign = warning amber).
- **Test:** a screenshot test finds every control above with its tooltip, in this order.

SQ29 Row header (figure p0724)
- Disclosure arrow, row icon (kit piece, note, melodic, degree or automation icon), name
  with the Row Assignment select, current mode label, `M` and `S`, playback mode select,
  rotate left/right, decrement/increment, randomize, clear.
- Subrow header: mode select (upper right), rotate, decrement/increment, randomize, clear.
  Hover on the left edge shows `Add Subrow` and `Delete Subrow`.
- Row color: a 3 px left stripe and the on-step fill (the track palette).
- **Test:** a click on `M` mutes the row and the render drops its notes.

SQ30 Step cell drawing (figure p0736)
- Off: subtle border, track color at low strength. On: full track color. A tie draws the
  tied cells as one merged cell with a diamond at each join. A playing step gets a frame in
  the playhead color (MUSIC_EDITOR_UI 4.3).
- Value modes draw a horizontal line at the value height inside the cell and the value text
  bottom-left (`47`, `100%`, `B-1`, `-1`, `53%`). Repeat draws N thin bars. Chance draws a
  dot texture whose density is the chance. Loop draws a frame around the loop range.
- Value display follows View > Display Edit Mode Values (SQ36).
- **Test:** the screenshot test of the p0736 fixture shows the 9 subrows with the values
  of the figure.

SQ31 Inspector (figure p0757)
- Tabs `Pattern`, `Row`, `Step`. Pattern: SQ2 settings. Row: SQ3 settings. Step: groups
  Playback (On/Off, Chance, Condition with Iteration and Cycles, Step Rate, Skip), General
  (Velocity, Gate %, Tie, Offset %, MIDI Channel, Articulation), Repeats (Repeat, Velocity
  Ramp %, Velocity Curve %, Distribution %).
- A field whose value differs across the selection shows `*`. Changing it applies a
  relative change (p. 754).
- **Test:** with two steps of velocity 80 and 100 selected, the field shows `*`, and +10
  gives 90 and 110.

## F. Gestures and commands

Modifier names below are macOS. On other platforms Command is Ctrl, Option is Alt and
Control is Ctrl+Alt (D106). Single-letter keys act only while the Step Sequencer has focus.

SQ32 Step clicks and drags
- On/Off mode: click toggles the step. Drag across steps paints the state of the first
  step's new value.
- Value modes: vertical drag sets the value, the value shows above the step while dragging
  (p. 735). Changing an off step's value turns it on (p. 736).
- On/off-only modes (Tie, Skip): click toggles.
- Command-click in Velocity/Value mode toggles the step (p. 1197).
- Option-click resets the step to defaults and turns it off. The cursor shows the eraser
  (D75). Option-drag resets each step the drag passes (p. 1197).
- **Test:** each gesture above produces the listed step state, and each is one undo step.

SQ33 Tie, ramp and multi-step
- Command-drag across steps ties them in any mode except Tie, Step Rate and Loop (D74).
- Tie mode: drag a step's right edge right to tie the following steps, left to untie. A
  click in the middle of a tied cell shortens the tie to that step (p. 733).
- Option-Command-click on a tied step removes the tie at that step (p. 1197).
- Command-Option-drag across steps writes ramped values from the first to the last step.
  Command-Option-Shift-drag does the same and leaves the steps off (p. 736).
- With several steps selected, a vertical drag on one moves all by one shared delta, limited
  so that no step leaves its range (p. 736).
- **Test:** Command-drag over steps 0 to 3 sets `tie` on 1, 2, 3, and a ramp from 20 to 80
  over 4 steps gives 20, 40, 60, 80.

SQ34 Selection and keyboard navigation
- Shift-click selects a step (any mode except Loop). Click a row header selects the row.
  Shift-click and marquee drag add. Arrows move the selected step, Shift-arrows extend.
  Apostrophe toggles the selected step.
- **Test:** Shift-Right from step 3 selects steps 3 and 4.

SQ35 Edit, Functions and row commands (shortcut in parentheses)
- Step: Cut (Cmd-X), Copy (Cmd-C), Paste (Cmd-V), Paste Steps (Option-Shift-V), Repeat Step
  (Cmd-R), Clear Step (Control-Delete), context menu Clear <mode>. Cut leaves an empty step
  in place. Paste needs the same row type and keeps the source step rate, except an unset
  source rate takes the target rate (p. 750).
- Row: Copy Row (Control-C), Paste Row (Control-V), Paste to New Row (Control-Shift-V),
  Paste Row Settings (Control-Option-Shift-V), Duplicate Row with Next Assignment (Cmd-D),
  Delete Row (Cmd-Delete), Delete Unused Rows (Shift-Cmd-Delete, shown only when unused rows
  exist), Clear Row (Control-Cmd-Delete), Clear Current Mode for Row (Option-Cmd-Delete),
  Rename Row (Shift-Return), Solo Row (Control-Shift-S), Mute Row (Control-Shift-M).
  Paste Row between two fixed note rows keeps the target pitch, so a rhythm moves to another
  drum. A melodic copy keeps Note and Octave (p. 752). Paste to New Row works across patterns.
- Pattern: Clear Pattern (Control-Shift-Cmd-Delete), Clear Current Mode for All Rows
  (Option-Shift-Cmd-Delete), Clear All Row Values > Current Edit Mode for Note Rows, and
  for Automation Rows.
- Transpose: +1 semitone (Option-Up), -1 (Option-Down), +1 octave (Option-Shift-Up), -1
  octave (Option-Shift-Down), on the selection, else the selected rows, else the pattern.
- Rotate: pattern (Control-Option-Cmd-Left/Right), row (Option-Cmd-Left/Right), current
  mode values only (Option-Shift-Left/Right). A subrow rotate moves only that mode's values
  and keeps on/off (p. 748).
- Increment/decrement buttons: pattern and row. Click = one unit, vertical drag = continuous.
  On/Off mode: increment turns all on, decrement turns all off. Tie mode: increment ties
  all but the last, decrement unties all (p. 751).
- Randomize current mode: selected rows (Shift-Cmd-R), all rows (Option-Cmd-R), selected
  steps (Option-Shift-Cmd-R), and the dice buttons. On/Off randomize respects Mono (p. 729).
- Playback mode keys: pattern Control-Option + `]` `[` P `\` Y U J, row Control + the same
  (forward, backward, ping-pong, shuffle, pendulum, wander, random).
- Step rate: pattern (Control-Shift-= / -), row (Control-= / -). Loop start for row
  (Control-Option-= / -), loop end (Option-Cmd-= / -).
- Edit mode keys: On/Off (Control-Option-S), Velocity/Value V, Gate G, Tie T, Note N,
  Octave O, Loop L, Repeat R, Chance C, Offset F, Step Rate A, Skip K. Next/previous mode
  (Option-Page Down / Page Up).
- Subrows: show/hide for row (Control-Cmd-Right/Left), for all rows (Control-Shift-Cmd-
  Right/Left), Option-click a disclosure arrow toggles all.
- Mono Mode (Control-Shift-Cmd-M), Pattern Browser (Option-Shift-B), Live Record
  (Shift-R), Learn Add (Option-Cmd-L), next page (Option-`).
- Every command above is in a menu as well as on a key.
- **Test:** a table-driven test fires each shortcut on a fixture and checks the op it
  dispatches with its arguments. A second test checks that every command has a menu item.

SQ36 View menu
- Display Edit Mode Values: Only When Editing, Always for Selected Row, Always for All Rows
  (default Always for Selected Row, D100). Sort Rows: By Type, By Type and Note, By Type and
  Name, By Type and Kit Pad, each Ascending or Descending. Show/Hide Row Colors. Show Local
  Inspector. Show Pattern Browser.
- Sort writes the row order to the document. The order holds until a row is dragged, and
  new rows from Learn, recording and step record go to their sorted place (p. 759).
- Drag a row header to reorder.
- **Test:** By Type orders note rows, melodic, CC, pitch bend, channel pressure, device params.

SQ37 Mono, Preview and MIDI Out
- Mono on: turning a step on turns off every other note row's step at that position. It
  does not change existing steps when switched on (p. 729).
- Preview plays the pattern from its start in a loop while the transport is stopped, through
  the track's instrument. MIDI Out off silences auditioning while editing (p. 760).
- **Test:** with Mono on, turning on kick step 0 turns off snare step 0.

## G. Learn and recording

SQ38 Learn (Add) and Learn (Assign)
- Add Row > Learn (Add) turns the Add Row menu into a red Learn button. A played note with no
  row adds a note row (kit row on a kit track). A controller event with no row adds an
  automation row. Click the button to stop (p. 729 to 730).
- Learn (Assign) shows an amber button. A note or controller sets the selected row's
  assignment.
- Inputs: hardware MIDI (Web MIDI on web, the native MIDI input on native) and the on-screen
  keyboard. Each learned row is one undo step.
- **Test:** in Learn (Add), MIDI note 38 adds a `Snare` row once, and a second 38 adds nothing.

SQ39 Live Pattern Recording (P2)
- Starts on the button with the transport or Preview running. Records from the region start
  to its end (or the cycle). Notes turn on the nearest step of the matching row and create
  missing rows. Chords turn on several rows unless Mono is on. Melodic rows record the last
  note in the step (p. 742 to 743).
- Options (Functions > Live Record Options, defaults D101): Velocity (on), Note Length (off),
  Quantize (on), MPE (off, Q1 backlog).
- One undo step per recording pass.
- **Test:** a recorded note 30 ticks after step 4 with Quantize off turns on step 4 with
  offset 13 (30/240 rounded to percent).

SQ40 Step recording (MIDI In) (P2)
- Each note turns on the selected step and moves to the next after the last held key is
  released (chords work). CC events set the value and do not advance. Left and Right move.
  Missing rows are created as in Learn.
- **Test:** a three-note chord turns on three rows at one step and advances once.

## H. Automation rows and drum kits

SQ41 Automation row targets (D88)
- `{kind: "cc", cc 0..127}`, `{kind: "pitchBend"}`, `{kind: "channelPressure"}` render
  into the expanded clip `controllers` (range from `controllerValueRange`).
- `{kind: "device", deviceId, param}` on the track instrument or an insert renders into a
  derived track automation overlay, read by the same automation engine as
  `AutomationLane`. A stored automation lane on the same target wins outside the region.
- Add Row > Automation lists MIDI controllers (as SE3 names), then the instrument params,
  then insert params.
- **Test:** a Cutoff row with Slide renders a linear ramp on the instrument cutoff between
  two played steps.

SQ42 Drum kit integration
- On a DR-1 or Sampler kit track, a new pattern region starts with the default template
  (SQ45) or, without one, one kit row per pad that has a sound, pad order.
- Kit rows show the pad name and a kit icon. Row Assignment lists pad names (p. 753).
- Note and Octave on a kit row change the pad's pitch, not the pad: the expanded note gets a
  constant `expression.pitch` of that many semitones (D90).
- Other instruments: Add Row > Notes > Drums lists GM_DRUM_LANES.
- **Test:** a Note +3 on a DR-1 kick row renders the kick pad with pitch +3, and the row
  name stays the pad name.

## I. Pattern Browser and templates

SQ43 Pattern Browser
- A panel left of the grid with search, the sections Patterns and Templates, each with
  Factory and User folders. Return runs the search (name match).
- Choosing a pattern replaces the open pattern (one undo step). Action menu: Use Project
  Key, Save Pattern (Shift-Cmd-P), Save Template (Shift-Cmd-T), New Folder, Delete Folder.
- Dragging a browser pattern to a MIDI track or below the last track creates a pattern
  region (a new track takes the pattern's saved instrument when the track is empty).
- **Test:** saving a pattern and loading it into a new region gives an equal pattern.

SQ44 Library storage (D92)
- Factory: `packages/timeline/src/midi/stepPatternLibrary.ts`, at least 24 patterns (drums:
  four-on-the-floor, boom bap, trap, breakbeat, house, techno, half-time, shuffle; bass,
  keys, arps) and 8 templates. Each entry: id, name, category, tags, pattern, optional
  instrument preset.
- User: JSON assets of content type `application/x-nodetool-step-pattern` in the asset
  folder `Step Patterns/<Patterns|Templates>/<folder>`.
- A template is a pattern with no step values (rows, subrows, settings).
- **Test:** every factory pattern passes `normalizePattern` and expands without error.

SQ45 Default template per track
- Functions > Store as Default Pattern Template (Control-Option-Cmd-D) writes the open
  pattern's template to `track.stepTemplate`. Revert to Default Pattern Template
  (Control-Option-Shift-D) removes it. New pattern regions on the track use it.
- **Test:** after storing, `create_pattern_region` on that track gives the stored rows.

## J. Undo

SQ46 Undo grouping
- One gesture = one undo entry: a click, a drag (however many steps it passes), a ramp, a
  menu command, an inspector field commit, a Learn row, a recording pass, a browser load, a
  conversion. Slider drags in the inspector commit once on release.
- Selection, page, zoom, edit mode, subrow visibility toggled from the view, and Preview are
  not undo entries. Mono is document data and is one.
- Agent ops are one undo entry each in the browser (applyAgentEdit).
- **Test:** a drag across 8 steps followed by one Undo restores all 8.

## K. Agent tools (mandatory parity)

Every op below follows the `join_clips` path: Op type in op.ts, parser in parse.ts, apply in
apply.ts, serialize, a contract in timeline-tool-contracts.ts, params in
timeline-tool-params.ts (`ui_timeline_<op>`), a `sharedTool` in timeline-bridge.ts, the
browser tool in web/src/lib/tools/builtin/timeline.ts, the name in timelines.specs.ts, a case
in timeline-op-parity.test.ts, and a section in
packages/system-skills/timeline-edit-ops/SKILL.md. Rows are addressed by `rowId` or
`row` (name, case-insensitive, unique). Steps are 1-based in agent input and output (D97).
Every error names the valid values.

SQ47 Pattern text (agents read and write it)
- One line per row: `<row name> [| rate] : <steps>`. Step chars: `x` on, `X` on velocity
  127, `o` on velocity 50, `.` off, `-` tie (continues), `_` skip. Spaces and `|` between
  steps are ignored. Example: `Kick: x... x... x... x...`.
- `patternToText` and `patternFromText` (SQ60) round-trip on, tie, skip and the three
  velocities. Other values need `set_steps`.
- **Test:** `patternFromText("Kick: x.x- ..X.")` gives steps 1 and 3 on, 4 tied, 7 at 127.

SQ48 Read
- `get_pattern` {clipId, modes?: mode[]} -> settings, rows (id, name, assignment, settings),
  the pattern text and, per requested mode, one value array per row.
- `get_state` shows a pattern region as `pattern: 4 rows x 16 @1/16` with its name.
- **Test:** `get_pattern` with modes ["velocity"] returns 16 values per row.

SQ49 Create and convert
- `create_pattern_region` {trackId, atBar|atMs, bars? (1), template? (library id or "track
  default"), text?}.
- `convert_pattern_to_midi` {clipIds}, `convert_midi_to_pattern` {clipIds, stepRate?},
  `separate_pattern_rows` {clipId}.
- **Test:** each op on the browser host and the headless host gives equal documents.

SQ50 Pattern settings
- `set_pattern` {clipId, ...any SQ2 field except rows}. Write-through rules of SQ2 apply.
- `set_pattern_seed` {clipId, seed?} (absent = a new random seed, returned).
- **Test:** `set_pattern` {lengthSteps: 32} repeats the steps as in SQ7.

SQ51 Rows
- `add_pattern_rows` {clipId, rows: [{assignment | pitch | pad | degree | cc | param, name?,
  text?, ...SQ3 settings}]}, `set_pattern_row` {clipId, row, ...SQ3 settings,
  assignment?}, `remove_pattern_rows` {clipId, rows | unused: true}, `move_pattern_row`
  {clipId, row, toIndex}, `sort_pattern_rows` {clipId, by, descending?},
  `copy_pattern_row` {clipId, row, toClipId?, toRow? (replace) | asNew?, settingsOnly?,
  nextAssignment?}.
- **Test:** `copy_pattern_row` from a kick row to a snare row keeps the snare pitch.

SQ52 Steps
- `set_steps` {clipId, row, steps: "1,5,9" | [1, 5] | "1-16", values: {on?, velocity?,
  gate?, tie?, note?, octave?, repeat?, chance?, offset?, stepRate?, skip?, value?,
  condition?, midiChannel?, articulation?, velocityRamp?, velocityCurve?, distribution?},
  ramp?: {field, from, to}}. A value edit on an off step turns it on (as SQ32).
- `set_pattern_text` {clipId, text, mode? "merge" | "replace"} applies SQ47 lines.
- `clear_pattern` {clipId, scope "steps" | "row" | "pattern", row?, steps?, mode?,
  rowType? "note" | "automation"}. Without `mode` all values reset.
- `copy_steps` {clipId, row, steps, toRow, toStep, toClipId?, cut?}.
- `repeat_step` {clipId, row, step}.
- **Test:** `set_steps` with ramp {velocity 20 to 80} over steps 1-4 equals the UI ramp.

SQ53 Transforms
- `rotate_pattern` {clipId, by (+ right), row?, mode?}, `transpose_pattern` {clipId,
  semitones, row?, steps?}, `randomize_pattern` {clipId, mode, rows?, steps?, seed?,
  density? 0..100 for on/off}, `nudge_pattern_values` {clipId, mode, delta, row?}
  (increment/decrement), `tie_steps` {clipId, row, from, to, tie: boolean}.
- `randomize_pattern` with the same seed gives the same result on every host.
- **Test:** `rotate_pattern` by 1 on row Kick with mode "velocity" moves velocities and
  keeps on/off.

SQ54 Library
- `list_step_patterns` {query?, kind? "pattern" | "template", category?} -> id, name,
  category, tags, source. `apply_step_pattern` {clipId | trackId + atBar, pattern,
  useProjectKey?}. `save_step_pattern` {clipId, name, kind, folder?}.
  `set_track_step_template` {trackId, fromClipId | clear: true}.
- **Test:** `apply_step_pattern` "Boom Bap" on an empty region gives the library rows.

SQ55 Native assistant
- MusicAssistant tools with the same names, arguments and errors: get_pattern,
  set_steps, set_pattern_text, set_pattern, add_pattern_rows, clear_pattern,
  convert_pattern_to_midi, convert_midi_to_pattern, apply_step_pattern.
- **Test:** tst_musicassistant runs the SQ52 vectors through the native tools and gets the
  TS results.

SQ56 Agent quality
- One JTBD case: "make a boom bap beat on the drum track for 4 bars, ghost snares, hats at
  70% chance" must pass with `get_pattern` evidence.
- **Test:** the case is in the JTBD suite and passes on the default model.

## L. Pure functions and vectors

SQ60 Web: packages/timeline/src/midi/stepPattern.ts (model, normalize, text),
stepPatternExpand.ts (expansion), exported from midi/index.ts, tests in
packages/timeline/tests/midi.stepPattern.test.ts. Native: the same names in
native/timeline/src/midi/PatternExpand.{h,cpp} plus StepSequencerModel.js for the UI, with
the same vectors through the music oracle.
- `stepRateTicks`: "1/4" 960, "1/8" 480, "1/16" 240, "1/32" 120, "1/64" 60, "1/2" 1920,
  "1" 3840, "2" 7680, "4" 15360, "1T" 2560, "2T" 1280, "4T" 640, "8T" 320, "16T" 160,
  "32T" 80, "1D" 5760, "2D" 2880, "4D" 1440, "8D" 720, "16D" 360, "32D" 180, "64D" 90.
- `normalizeStep`, `compactStep`, `normalizePattern`: SQ2, SQ5 defaults.
- `stepPitch(row, step, ctx)`: melodic row 60, step note +2, octave 4 -> 74 (octave n has
  C at (n + 2) * 12). Kick row 36 with no fields -> 36.
- `rowSchedule(row, pattern)` -> [{stepIndex, startTick, lengthTicks}] for one cycle.
  Vectors: 4 steps 1/16 forward -> starts 0, 240, 480, 720. Same with step 2 skip ->
  0, 240 (step 3), 480 (step 4). Step 2 rate "1/8" -> 0, 240, 720, 960.
- `playOrder(n, mode, seed, cycle)`: (4, pingPong) -> 0 1 2 3 3 2 1 0, (4, pendulum) ->
  0 1 2 3 2 1, (4, backward) -> 3 2 1 0. Random modes: vectors generated by the TS
  implementation and pinned in the oracle file.
- `stepHash(seed, rowKey, step, cycle)`: FNV-1a 32 over the four little-endian uint32,
  then mulberry32. Pinned vectors: the first 8 values for seed 1, row "r1", step 0..7,
  cycle 0, generated once and checked on both surfaces.
- `swingDelay(tick, division, swing)`: (240, "1/16", 50) -> 60, (480, "1/16", 50) -> 0,
  (480, "1/8", 100) -> 240.
- `repeatPositions(T, N, distribution)`: (240, 4, 0) -> 0 60 120 180. `repeatVelocities(v,
  N, ramp, curve)`: (100, 4, -100, 0) -> 100 67 33 1.
- `expandPattern`: the 12 oracle fixtures: four-on-the-floor, ties and gate, legato, swing
  1/8 and 1/16, offset at clip start, repeat with distribution, chance 50 seed 7, recurrence
  2 of 3, ping-pong row, polymeter 16 against 12, kit row with note +3, CC row latch and
  slide.
- `patternToText`, `patternFromText`: SQ47.
- `midiToPattern`: SQ21 vectors.

## Decisions

- D70 **(confirm)**: the editor is named `Step Sequencer`. MUSIC_EDITOR_UI.md 4.3 uses
  "Step Editor" for it, but the SE contract already built a Step Editor (Logic's event-beam
  editor), so two names are needed. The 4.3 row changes in the same PR.
- D71 **(confirm)**: a pattern region is a MIDI clip with a `pattern` field, not a new clip
  media type. Tracks, instruments, clip ops and CE fields work without new branches.
- D72: pattern time is in ticks at MIDI_PPQ 960 from the clip content start, the same base
  as `notes`, so tempo changes need no new code.
- D73: 1..64 steps per row and pattern, as Logic's Length menu and conversion limit.
- D74 **(confirm)**: Command-drag ties. Command-Option-drag ramps. The manual gives both to
  Option-Command on p. 1197, but the text on p. 733, 736 and 750 assigns them apart, and
  one gesture cannot do both.
- D75: Option-click resets the step to defaults and turns it off. In a fixed grid "delete"
  and "reset and turn off" leave the same cell, and p. 751 and p. 1197 agree on reset.
- D76 **(confirm)**: gate is an integer percent 1..100, default 100. The inspector in
  p0757 shows `100 %`. Legato covers overlap, so 101..127 is not needed.
- D77: defaults velocity 100, gate 100, chance 100, offset 0, repeat 1, ramp, curve and
  distribution 0, articulation 0, condition Always. All read from the p0757 Step inspector.
- D78: chance, wander, shuffle, random and randomize use a seeded hash. Export, the server
  and native must give the same notes, and agents must be able to test results.
- D79: chance is an integer 0..100. The manual gives a percent with no range.
- D80: Octave is absolute (-2..8 with C3 = 60), Note is -12..12 semitones from the row
  pitch. Figure p0736 shows octave `-1` and note `B-1`, which are absolute values.
- D81: an unset step rate inherits the row rate, so the p. 750 paste rule has a stored state.
- D82 **(confirm)**: swing 0..100 with 0 straight and 100 = half a division late. Logic does
  not state the curve. 66 lands near a triplet feel.
- D83: Backward is the UI label. Reverse stays only as the key command name.
- D84: cycle index and First/Last Loop count pattern passes from the clip start, across
  region loop repeats. A loop repeat is a pass from the listener's view.
- D85: notes past step 64 in a MIDI-to-pattern conversion are dropped and counted, not
  refused. Logic converts with the same limit.
- D86: the piano roll shows a pattern region read-only with a convert button. Logic allows
  pattern edits only in the Step Sequencer (p. 750), and two write paths would conflict.
- D87: split keeps sound by `patternPhaseTicks`. Without a phase the right half would
  restart the pattern and change the music.
- D88 **(confirm)**: automation rows target MIDI controllers and instrument or insert
  device params in P1. Mixer volume and pan rows, and pattern regions on audio tracks, go to
  the backlog.
- D89: a page is 16 steps, the Logic page size at default zoom.
- D90: Note and Octave on a kit row bend the pad pitch through `expression.pitch`. DR-1 has
  one sound per key, so moving the key would change the drum.
- D91 **(confirm)**: Separate by Row makes new MIDI tracks. NodeTool has no Drum Machine
  Designer subtracks.
- D92 **(confirm)**: user patterns and templates are assets of type
  `application/x-nodetool-step-pattern`. Assets already sync, search and survive projects.
- D93: articulation 0..255 is stored and shown but has no sound effect until MidiNote gets
  an articulation field (backlog). Templates from Logic-style workflows keep the value.
- D94: step channel 1..16 maps to `MidiNote.channel` 0..15.
- D95: note repeat positions and ramps follow the SQ15 formulas, since the manual names the
  controls but not the curves.
- D96: Mono is pattern data. Randomize and recording respect it, and agents must see it.
- D97: agent input and output use 1-based steps, the numbers on the grid.
- D98: `randomize_pattern` takes a seed and returns the one it used, so an agent can repeat
  a result.
- D99: on Windows and Linux, Command = Ctrl, Option = Alt, Control = Ctrl+Alt. A binding
  that collides with a global editor shortcut stays menu-only, listed in the keymap table.
- D100: Display Edit Mode Values defaults to Always for Selected Row. Logic does not state a
  default, and values on one row keep the grid readable.
- D101: Live Record defaults Velocity on, Note Length off, Quantize on, MPE off. Logic
  advises Note Length off for drums (p. 743), the first use case.
- D102: Live Pattern Recording and step recording ship in P2. Learn ships in P1 because it
  is the fast way to build rows.
- D103: the default automation mode is Latch. Logic's example switches to Slide on purpose
  (p. 740), so Latch is the base state.
- D104: native gets a C++ `PatternExpand` port checked by the oracle, not a call into TS.
  The native engine renders in process.
- D106 (replaces the detail of D99): off macOS, Command = Ctrl, Option = Alt, Control =
  Ctrl+Alt. Where a Control chord collides with an Option-Command chord, the Option-Command
  entry keeps the key and the Control action is menu-only. Where only Control chords
  collide (for example the pattern and row playback keys), the chord with the fewest macOS
  modifiers keeps the key and the others are menu-only. The command test asserts every
  command ID on both platforms.

## Open questions

- Q20: the Logic Tie and Option-click results (D74, D75) come from the manual text, not a
  test in Logic. A person with Logic 13 should confirm both gestures once.
- Q21: should pattern regions on audio tracks (effect automation only, p. 725) be in scope
  now, or stay in the backlog with D88?
- Q22: should the factory library carry instrument presets per pattern (Logic pattern loops
  include the patch), or patterns only?

## Build plan

Order: B1, then B2 and B3 in parallel, then B4. Respect the two-agent limit.

| ID | Scope | Model | Exit |
|---|---|---|---|
| B1a | SQ1 to SQ26, SQ60: types, normalize, expansion, conversion, CE interactions, events.ts and cache key, factory library | agy Neon | timeline vitest green with every SQ60 vector |
| B1b | SQ47 to SQ56: ops, protocol contracts and params, bridge, web tool, specs, parity test, skill section, JTBD case | agy Neon | agents and protocol tests, parity test, `harness gate` green |
| B1c | SQ9 and SQ55 native: `PatternExpand` C++ port, oracle fixtures, MusicAssistant tools | agy Neon | oracle and tst_musicassistant green, tst_* targets only |
| B2 | SQ27 to SQ46 web: Step Sequencer tab, menu bars, rows, subrows, cells, inspector, browser, shortcuts, Learn | Opus | screenshot loop against p0724, p0736, p0757 at each step, jest for the shortcut table |
| B3 | SQ27 to SQ46 native: dock panel and the same parts in Qt Quick with ui_primitives | Opus | offscreen screenshot loop, `check_design.py --strict`, tst_ UI tests |
| B4 | Review of B1 to B3 | agy, then Sol | agy findings fixed, then Sol second review, then the tracker entry moves to done |
| B5 | SQ39, SQ40 live and step recording (P2) | agy Neon, Opus for UI | after B4 |
