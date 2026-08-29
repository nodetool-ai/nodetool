---
name: nodetool-script-video
description: Direct video where a written voiceover drives the picture — faceless explainers, narrated b-roll, documentary segments, tutorials, corporate and educational video with no on-camera talent. Use when the user asks for an explainer, a voiceover video, a narrated piece, a faceless video, or says the script comes first. Also use when spoken words must time the cut. Not for talking-head or creator video (use nodetool-ugc-video).
---

**Load `/nodetool-storyboard-core` first.** It carries the loop, the tool contract and
the gating this skill assumes. This job type inverts the order of that loop, so read
the sequence below before creating a board.

## What makes this job type its own

Everywhere else the picture comes first and the words ride along. Here the words are
the spine: they set the running time, and each shot has to be exactly as long as the
line it covers. That is a different tool path — a **script resource** the storyboard
links to — not a storyboard with narration typed into it.

The payoff is that `assemble_storyboard_timeline` on a linked board cuts words and
picture together: each shot runs as long as the takes it covers, and every voiced line
becomes its own voiceover clip.

## The sequence

1. **Research and write the voiceover.** 150–165 words is about 60 seconds. Write it
   before anything visual exists.
2. `create_script {name}`.
3. `edit_script {script_id, ops}` — `{"op": "add_speaker", "name": "Narrator"}`, then
   one `{"op": "add_line", "text": "..."}` per sentence. One sentence per line: a line
   is the unit that gets a take and times a shot, so a paragraph in one line gives you
   a shot you cannot cut.
4. **Give the narrator a voice:** `find_model` (`text_to_speech`) →
   `{"op": "set_speaker_voice", "target": "Narrator", "provider", "model", "voice"}`.
   Without it every line reads `no_voice`.
5. `derive_storyboard_from_script {script_id, provider, model}` — one shot per line, in
   reading order, each carrying the line ids it covers. Pass a language provider and
   model for a director pass that writes each shot's visuals over that scaffold; omit
   **both** for the bare scaffold.
6. **Rewrite the visuals.** The derived shots are a starting point. Go through with
   `edit_storyboard` `update_shot`, giving each an `action` that is concrete b-roll and
   a `motion` with a count. Set the board `style` and `entity_ids` with `set_board`.
7. **Stills on every shot**, reviewed, before any clip.
8. `voice_script_lines {script_id}` — defaults to every draft or stale line. Word
   timings come from a transcription pass (`transcribe: true` by default) and ride into
   the clips as captions.
9. Clips, then `assemble_storyboard_timeline`, then `validate_timeline`.
10. **Duck the pictures' own sound.** Assembly gives every shot clip an audio twin on a
    "Shot Audio" track. `edit_timeline` → `get_state`, then `set_clip_params` with
    `muted: true` on those clips so the voiceover carries.

## Timing

A shot on a linked board takes its length from its lines' takes — that is
`duration_source: "audio"`, the default once linked. Leave it alone. Pin a shot with
`duration_source: "manual"` plus `duration_seconds` only when it must hold past its
narration, such as a final card.

Voice **before** you cut. A line with no take leaves its shot on its own duration, and
the assembly lists it as skipped.

## Style registers

Put one in the board `style`, and say `no on-screen type` — titles belong on the
timeline as text clips, where they stay editable.

| Register | `style` |
|---|---|
| Flat 2D | `flat vector illustration, three-colour palette, thick uniform strokes, white ground` |
| Documentary macro | `macro photography, shallow depth, natural light, matte film grade` |
| Dark UI | `dark interface on a black ground, single accent colour, crisp type-free panels` |
| Paper-craft | `cut-paper layers, soft drop shadows, warm raking light` |

## Music

Set the board's `music_prompt` only if the board is open in a browser tab —
`ui_storyboard_set_screenplay` is the only writer for it, and assembly turns it into a
draft audio clip. Headless, add a music track yourself: `generate_music`, then
`edit_timeline` → `add_track` + `add_media_clip`, and set its `volumeDb` low enough to
sit under the voiceover.

## Brief

```
Research [TOPIC], then direct a faceless 16:9 explainer. No on-camera talent.

Write the voiceover first, 150-165 words, one sentence per line, as a script:
create_script, then edit_script to add a Narrator speaker and the lines. Give
the narrator a voice with set_speaker_voice before anything else.

Then derive_storyboard_from_script with a director pass, and rewrite each of the
eight shots' action and motion as concrete b-roll to that voiceover.
Board style: [flat 2D / documentary macro / dark UI / paper-craft], no on-screen
type.

Stills on every shot before any clip. Then voice_script_lines so the shots take
their length from the takes, then clips, then assemble_storyboard_timeline and
validate_timeline. Finish by muting the Shot Audio clips under the voiceover.

Stop after the script and the board. Show me the words before you spend.
```
