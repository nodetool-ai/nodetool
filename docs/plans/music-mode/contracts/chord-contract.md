# Chords like Logic Pro, agent first: shared contract (CH)

Screenshot: /private/tmp/claude-501/-Users-mg-workspace-nodetool/809e0820-c4db-42d4-8fd7-e46d090e6163/images/11.png
(global Signature and Chord rows under the ruler; region chord strips at the bottom of
the player regions; the Session Player editor below.)

Goal: the user sees the chords and the music follows them. The agent does the work. The
user edits little: a click on a chord to change it, a progression picker, a few menu
commands. Every chord action is an operation that the agent and the UI share.

## What exists (do not rebuild)

- Model: a track of type `chord` holds `chords: TimelineChord[]` ({id, startTick,
  durationTick, root 0..11, quality, inversion}, document ticks from `tempo.offsetMs`,
  MIDI_PPQ = 960). Key: `tempo.key` {tonic, mode}. A MIDI clip's `harmony` (ClipHarmony:
  arp, comp, scale snap "off" | "key" | "chords") follows a chord track (`chordTrackFor`).
- Pure helpers in packages/timeline/src/harmony/: CHORD_QUALITIES, chordName (display,
  Unicode), chordNotes, sortChords, chordAtTick, placeChord, transposeChords, PROGRESSIONS,
  progressionChords, replaceChordRange, SCALES, keyScale, chordScale, scaleRemap, remapNote,
  COMP_LIBRARY, expandClipHarmony, harmonizeClips.
- Web UI: Tracks/ChordLane.tsx, daw/harmony/* (ChordLaneBody, ChordEditor,
  ProgressionBrowser, HarmonyPanel, CompBrowser, ScaleStrip, chordGrid.chordHue).
- Agent ops: packages/timeline/src/ops (op.ts, parse.ts, apply.ts, serialize.ts) with
  contracts in packages/protocol/src/api-schemas/timeline-tool-contracts.ts and
  timeline-tool-params.ts. Browser and headless hosts run the same ops. Shipped skill:
  packages/system-skills/timeline-edit-ops/SKILL.md. There is no chord or harmony op today.
- Native: a `chord` track type and header only. No chord drawing, no harmony playback.

## CH1 Chord symbols (pure, both surfaces)

- `chordSymbol(chord)`: the ASCII symbol agents read and write. Roots: C C# D Eb E F F# G Ab
  A Bb B. Qualities: maj "", min "m", dim "dim", aug "aug", sus2 "sus2", sus4 "sus4", five
  "5", six "6", m6 "m6", dom7 "7", maj7 "maj7", m7 "m7", mMaj7 "m(maj7)", m7b5 "m7b5", dim7
  "dim7", aug7 "aug7", sus7 "7sus4", add9 "add9", madd9 "m(add9)", dom9 "9", maj9 "maj9", m9
  "m9", dom7b9 "7b9", dom7s9 "7#9", m11 "m11", dom11 "11", maj13 "maj13", dom13 "13".
  Inversion n > 0 adds "/<bass>", where bass = the pitch class of chord tone n (the
  `CHORD_QUALITIES` interval order, after `% 12`). The UI keeps `chordName` for display.
- `parseChordSymbol(text)` -> {root, quality, inversion} or an error with a message that
  lists the accepted forms. Accepts the chordSymbol output and these aliases: roots with
  #, b, ♯, ♭; "M", "maj" -> maj; "min", "-" -> min; "°", "o" -> dim; "+" -> aug; "M7",
  "Δ", "Δ7" -> maj7; "min7", "-7" -> m7; "ø", "ø7" -> m7b5; "°7", "o7" -> dim7; "+7", "7#5"
  -> aug7; "7sus" -> sus7; "sus" -> sus4; "mMaj7", "mM7" -> mMaj7; "madd9" -> madd9.
  Whitespace around the text is ignored. Slash bass: inversion = the first chord tone
  index whose pitch class is the bass. A bass that is not a chord tone is an error (the
  model has no free bass).
- Vectors: "Am" -> {9, min, 0}; "C/E" -> {0, maj, 1}; "Bb7" -> {10, dom7, 0}; "F#m7b5" ->
  {6, m7b5, 0}; "Cadd9/D" -> {0, add9, 3}; "C/D" -> error; "H7" -> error. Round trip: for
  every root, every quality and every inversion whose bass pitch class first occurs at that
  index, parseChordSymbol(chordSymbol(c)) equals c.

## CH2 Chord chart text (pure, both surfaces)

- `chordChart(chords, startTick, endTick, tempo)`: one cell per bar, "| Am | F | C G |".
  A cell lists the chords that start in the bar, in order, separated by one space. A bar
  where the previous chord continues shows "%". A bar with no chord shows "-".
  Vector (4/4, bar = 3840 ticks): chords Am 0..3840, F 3840..7680, C 7680..9600, G
  9600..11520, range 0..15360 -> "| Am | F | C G | - |".
  Vector: Am 0..7680, range 0..7680 -> "| Am | % |".
- `parseChordChart(text, startTick, tempo)` -> chords (the inverse of chordChart): "|"
  separates bars, chords in one bar split it evenly, "%" holds the previous chord one more
  bar, "-" is a bar without a chord. Vector: "Am | F | C G" at 0 -> the four chords above.
  Vector: "| Am | % |" at 0 -> one Am 0..7680.

## CH3 Agent operations (packages/timeline/src/ops + protocol contracts)

All follow the set_notes pattern (contract, parse, apply, serialize), run in browser and
headless hosts, and are one undo step each in the browser (applyAgentEdit). Every error
teaches: it names the valid values.

- `set_chords` {trackId?, startBar? (1-based, default 1), chart: string} or
  {trackId?, startBar?, chords: [{symbol, bars?, beats?}]}. Replaces the chords in the
  covered range (`replaceChordRange`). Without `trackId`: the first chord track, created
  when missing.
- `clear_chords` {trackId?, startBar?, endBar?}.
- `list_progressions` -> every PROGRESSIONS entry: id, name, family, numerals, length.
- `apply_progression` {progression (id or name), key? ("A minor", "C", "F# major"; default
  the document key, else C major), startBar?, barsPerChord? (default 1), repeat? (default 1),
  trackId?}.
- `transpose_chords` {semitones, startBar?, endBar?, includeNotes? (default false: true
  also transposes the written notes of MIDI clips that do not follow the chord track, in
  the range)}.
- `detect_chords` {clipIds? | trackIds?, startBar?, endBar?, resolution? ("bar" | "half" |
  "beat", default "bar"), write? (default true)}. MIDI clips use CH4. Audio clips use CH7
  (added by a later agent; until then an audio source returns a clear "not yet" error).
  write = true replaces the chord track range and returns the chart. write = false only
  returns the chart.
- `set_clip_harmony` {clipId, style? ("off" | "arp" | "comp"), preset? (a COMP_LIBRARY
  name), scale? ("off" | "key" | "chords"), octave?, chordTrackId?}. Merges into
  clip.harmony. `list_harmony_presets` -> the COMP_LIBRARY names and the arp orders.
- `fit_notes_to_chords` {clipIds, mode? ("chord-tones" | "scale", default "scale")}: moves
  every written note to the nearest allowed pitch of the chord at its start (`chordScale`
  or the chord tones, `remapNote` rules, ties go down). Notes outside every chord stay.
  One undo step. This bakes the change, so the piano roll shows the real notes.
- State for agents: `get_state` gains, per chord track, `chordChart` (CH2, whole document)
  and the key and signature. Tracks and clips carry `harmony` in a short form
  ("comp: Ballad Pads, scale: chords") when set.
- Update packages/system-skills/timeline-edit-ops/SKILL.md: a "Chords" section with the
  ops, the chart grammar and two short examples ("write Am F C G for 8 bars and make the
  piano comp follow it"; "detect the chords of the keys stem").

## CH4 Chord detection from MIDI notes (pure, both surfaces)

`detectChordsFromNotes(notes, windows)`: notes with absolute ticks, windows = [{startTick,
endTick}]. Per window:
- Weight per pitch class = the overlapped ticks of each note (muted notes skip). The bass
  (the lowest note sounding in the window, by pitch) gets its weight doubled.
- Candidates: every root and the qualities maj, min, dim, aug, sus2, sus4, dom7, maj7, m7,
  m7b5, dim7. Score = (weight on chord tones) - 0.5 x (weight off chord tones) - 0.3 x
  (largest pitch-class weight) x (number of chord tones with zero weight).
- Best score wins. Ties: fewer tones, then the root equal to the bass pitch class, then
  the lower root. Inversion from the bass (CH1 rule). A window with no sounding note holds
  the previous chord. Equal neighbours merge into one chord.
- Vectors (one window per 4/4 bar): C E G whole notes -> C; A C E -> Am; G B D F -> G7;
  E (lowest) G C -> C/E; bar 1 and bar 2 both C E G -> one C of two bars; bar 1 C E G, bar 2
  empty -> one C of two bars.

## CH5 Display (web and native)

- In the music view (web: the DAW / music mode tracks view; native: the Music workspace),
  two global rows sit under the ruler, as in image 11:
  - `Signature`: the time signature and the key ("4/4  C", "4/4  Am").
  - `Chord`: the first chord track's chords as blocks with the chord name, a divider at
    each chord start, the existing chord colors (web `chordHue`; native the same mapping).
  - In that view the chord track does not also show as a normal track row.
- Region chords: a MIDI clip that follows the chord track (harmony style arp or comp with
  input "chords", or scale "chords") draws a chord strip along its bottom edge (about 14 px):
  one cell per chord under the clip with its name, in a darker shade of the clip color.
  A clip that does not follow chords has no strip.
- Outside the music view nothing changes.

## CH6 Light editing (web and native)

- Click a chord block: a popup with the seven diatonic triads of the key (a toggle shows
  the seventh chords instead), the current chord marked, and a text field that takes any
  chord symbol (CH1). One undo step.
- Drag the line between two chords: moves the change, snapped to the beat. One undo step.
- The Chord row menu ("+" button and right-click): Apply Progression... (web: the existing
  ProgressionBrowser), Detect Chords from Selection, Transpose Chords..., Clear Chords.
- Empty Chord row: "No chords yet. Ask the assistant for a progression, or pick one." and an
  Apply Progression... button.
- Every UI edit calls the CH3 functions, so the agent and the user edit the same way.

## CH7 Chord detection from audio (pure, then op wiring)

`detectChordsFromAudio(samples: Float32Array mono, sampleRate, windows in ms)`:
- Chroma: Hann frames of 4096 samples at 44.1 kHz (scale the size to the rate, power of
  two), hop = half a frame, magnitude spectrum, bins from 55 Hz to 5 kHz mapped to the
  nearest pitch class (A4 = 440 Hz), summed. Per window: the mean chroma, normalized to a
  maximum of 1. The bass weight rule uses the lowest of the strong bins (> 0.5 of the
  frame maximum) under 300 Hz.
- Then the CH4 scoring, ties, inversion and merge rules on the chroma weights.
- Tests synthesize audio in the test (sums of sines or triangles for the chord tones).
  Vectors: C E G for 2 s -> C; A C E -> Am; 1 s C then 1 s G B D with 1 s windows -> C, G.
- Op wiring: `detect_chords` accepts audio clips. The clip's source window, speed and time
  remap decide which source samples belong to each window (timeline-space vs source-space
  rules in packages/timeline/AGENTS.md). Browser: the existing decode path. Headless: the
  runtime media decode. A track list skips tracks whose musicRole is drums.

## CH8 Generated music follows the chords (native music mode)

- When a music job generates audio for a range and the chord track has chords there, the
  job prompt gets one more line: "Chord progression: | Am | F | C G |" (CH2 chart of the
  range). The generation record stores that line.
- Pure function `chordPromptLine(chords, startTick, endTick, tempo)` -> the line or "" when
  the range has no chord. Same vectors on both surfaces.

## CH9 Native ports and assistant tools

- Port CH1, CH2 and CH4 to native (C++ in src/music or a .js next to the qml) with the same
  vectors, through the native oracle pattern where the repo has one.
- MusicAssistant tools: get_chords (chart + key + signature), set_chords, apply_progression,
  detect_chords (MIDI), clear_chords, transpose_chords. Same argument names and errors as
  CH3.

## CH10 Native harmony playback (separate agent)

- Port ClipHarmony playback (expandClipHarmony: arp, comp, scale snap, the comp library)
  to native with oracle vectors from the TS functions, so a native MIDI clip that follows
  the chord track plays the same notes as on web. set_clip_harmony becomes a native
  assistant tool after this.

## Decisions

- D14: chords stay on a chord track (no new global model). The music view shows the first
  chord track as the global Chord row.
- D15: agents read and write chords as ASCII symbols and a bar chart string. The UI keeps the
  Unicode display names.
- D16: a slash chord with a bass outside the chord is refused, because the model has no
  free bass note.
- D17: written MIDI notes follow chords by an explicit bake (`fit_notes_to_chords`). The
  live scale snap stays for clips that use harmony.
- D18: no Session Player clone. The existing comp and arp (ClipHarmony) play that role.
- D19: generated audio gets the chord chart in its prompt. Whether the model follows it is
  not measured yet (R13).
