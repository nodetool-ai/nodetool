# Clip editing contract (CE) — music clips (audio and MIDI) in the music layout

Source: a gap inventory of web, native and agent ops on 2026-11-22. Editing today follows
Premiere/FCP. These items add the DAW behaviors that music work needs. The agent is the main
editor: every item has an op, ops address time in bars where the music layout does, and
get_state shows the result. Web and the shared TS ops come first; native ports the same behavior.

## P1

CE1 MIDI split and slip
- split_clip on a MIDI clip partitions the content. The left clip keeps notes that start before
  the cut. The right clip keeps notes that start at or after the cut, re-based to its own start.
  Controllers and per-note expression partition the same way. No clip holds hidden notes.
- D46: a note that crosses the cut is shortened to end at the cut (crossing: "shorten", default,
  same sound as today). crossing: "split" also adds the rest of the note to the right clip.
- Web slip (move content inside the clip) works for MIDI clips, as native already allows.

CE2 Repeat, bar addressing, music nudge
- D51: duplicate_clip takes count (1..64). Copies go back to back (no gap in the music layout).
- D49: clip ops that take a time in ms (move_clip, split_clip, duplicate_clip, trim_clip,
  add_media_clip, and CE3/CE4 ops) also take bar positions: atBar (1-based) plus optional beat
  (1-based), resolved through the tempo map. ms and bar forms are mutually exclusive.
- D50: in the music layout, nudge moves the selection by the snap value (Smart = current grid
  step). Shift+nudge moves one bar. Other layouts keep frame / 1 s nudge.

CE3 Region loop
- D47: new optional clip field loopLengthMs (MIDI and audio clips). When set and less than
  durationMs, the content window [inPoint, inPoint + loopLengthMs) repeats until durationMs.
  Playback, export, the clip body drawing (repeats dimmed, a notch at each repeat) and the note
  lines all follow it. Notes and audio that cross a repeat boundary are cut at the boundary.
- UI: a drag at the top-right corner of a music clip loops it; the plain edge still trims.
- Op loop_clip { clipId, times | untilMs | untilBar }, and loopLengthMs: null removes the loop.
- Split, join and trim of a looped clip first unroll it into plain copies (one undo entry).

CE4 Section edits across tracks (song structure)
- D48: insert_time { atBar|atMs, bars|ms, trackIds? } inserts silence: content at or after the
  point moves later, and a clip that crosses the point splits there. delete_time
  { fromBar,toBar | fromMs,toMs, trackIds? } removes the range and closes it. duplicate_range
  { fromBar,toBar, trackIds? } copies the section and inserts the copy right after it.
- Without trackIds the ops act on all tracks, and they also move chords, markers, tempo and
  signature changes, and automation points. With trackIds only those tracks change.
- Locked clips move with inserted time. delete_time refuses when it would cut or remove a locked
  clip, and the error names the clips.
- UI: a range selection over many tracks (music layout) with Cut, Copy, Paste, Delete,
  Insert Silence and Duplicate Section.

## P2

CE5 Join
- D52: join_clips joins MIDI clips of one track into one clip from the first start to the last
  end. Notes, controllers and expression re-base. Gaps stay silent. Harmony settings come from
  the first clip. Audio join works only for adjacent pieces of one source with continuous source
  time; other audio joins are refused with "needs bounce".

CE6 Non-destructive MIDI clip parameters
- D53: new optional clip fields transpose (-48..48 semitones), velocityOffset (-127..127) and
  quantize { grid, strength 0..100 }. They apply at playback, export and in the note lines.
  The piano roll shows stored notes with a badge for each active parameter. Ops: the
  set_clip_params keys. The destructive ops stay.

CE7 Automatic crossfade
- D54: in the music layout, audio clips on one track that touch or overlap get a crossfade at
  render time (project setting autoCrossfadeMs, default 10). Stored fades win where present.

CE8 Clip color and name
- D55: set_clip_params accepts labelColor. The web clip context menu sets color and renames
  any clip (native already sets color).

## Backlog (needs a decision from the user before work)
- Alias clips (linked patterns), bounce in place and audio glue of different sources, reverse
  and web normalize, comping of recorded takes, audio that follows tempo changes.
