---
name: short-film
description: Direct narrative video in NodeTool — short films, trailers, teasers, single dramatic scenes, music-video segments with a story. Use when the user gives a logline, a genre, characters with dialogue, or asks for a short, a trailer, a scene, or a cinematic piece with a title and a score. Not for ads or product films (use product-commercial) and not for narrated explainers (use script-video).
---

**Load `/storyboard-core` first.** It carries the loop, the tool contract and
the gating this skill assumes. Everything below is what narrative work adds on top.

## What makes this job type its own

An ad needs a board. A narrative piece needs the **screenplay framing** around it:
title, logline, style bible, narration and a music prompt. Those live on the board's
screenplay, and that has one writer.

**`ui_storyboard_set_screenplay` is the only tool that writes them.** `edit_storyboard`
`set_board` takes `brief`, `style`, `aspect_ratio`, `entity_ids`, `image_model` and
`video_model` — and refuses the rest. So:

- Board open in a browser tab → `ui_storyboard_set_screenplay` with the whole
  screenplay object, framing and shots together, in one call.
- Headless → create the board with `create_storyboard`, put the look in `style` and
  the premise in `brief`, keep the words on each shot's `dialogue` and `narration`,
  and tell the user that the title, logline and music prompt need the board open. Do
  not pretend they were set.

This matters at assembly: `assemble_storyboard_timeline` turns the screenplay's
narration and music into draft audio clips ready to generate. With no screenplay there
are no draft clips, and you add the score yourself with `generate_music` plus
`edit_timeline` → `add_track` + `add_media_clip`.

## The screenplay object

```json
{
  "type": "screenplay",
  "title": "Night Drop",
  "logline": "A courier discovers the package was never meant to arrive.",
  "brief": "40-second neo-noir teaser",
  "styleBible": "wet asphalt, sodium and cyan, anamorphic flare, 2.39:1 crop, heavy grain",
  "aspectRatio": "16:9",
  "narration": "",
  "musicPrompt": "sparse low synth pulse, one rising note at 0:32, no drums",
  "entityIds": ["<asset id>"],
  "shots": [
    {
      "slug": "1a",
      "action": "Wide. Mara stands alone under a sodium lamp on wet asphalt, the city behind her out of focus",
      "camera": { "framing": "wide", "lens": "40mm anamorphic", "angle": "low", "movement": "slow push" },
      "motion": "she turns her head once toward the sound off-frame; rain falls steadily",
      "dialogue": "",
      "durationSeconds": 7
    }
  ]
}
```

`style` is accepted as an alias of `styleBible`. Only `action` is required per shot;
ids, indexes and statuses are filled in.

## Shot pattern

Six shots for forty seconds is a workable ratio — long enough to hold, few enough to
afford. **Open wide, end close.** The wide establishes the world, the close is what the
audience leaves with.

- Give shots room: 5–8 seconds each. Narrative shots that run 2 seconds read as an ad.
- Write blocking as physical events with counts — `she turns her head once`, `he sets
  the case down and does not let go` — and keep emotion out of `motion`. "Tense" is
  not a motion; a held stillness is.
- Dialogue goes in the shot's `dialogue` field, not in `action`. That keeps the option
  open to lift the words into a real script with
  `extract_script_from_storyboard` and voice them per `/script-video`.
- The style bible carries the grade. Do not restate it per shot — it is appended to
  every still prompt already.

## Casting

Each character is a character entity: generate a reference, show the user, then
`create_entity`. Add every one to the board with `set_board {entity_ids}`. A character
seasons only the shots whose text names them, which is what you want in a scene where
one person is alone.

Recurring locations are worth a **location entity** — those apply to every shot on the
board, which is how a single street stays the same street across six cuts.

## Direct mode earns its place here

Dialogue that must look synced, and heavy camera movement, both come out stiffer from
a still. Set those shots to `render_mode: "direct"` and put the framing and the style
into the action text, since no still carries them in. Keep the establishing and static
shots on `keyframe` — they are the ones where holding the look matters most.

## Brief

```
Direct a 40-second [genre] short: [LOGLINE]. Six shots, open wide, end close,
5-8 seconds each.

Write the full framing as well as the shots: title, logline, style bible,
aspect ratio, and a music prompt. If the board is open in a tab, set all of it
with ui_storyboard_set_screenplay in one call; if not, say so and keep the look
in the board style and the words on the shots.

Cast every character as an entity from a reference you show me first, plus a
location entity for the street. Set the shots that carry spoken lines to
render_mode direct.

If I gave no logline: a night courier loses the package. Wet asphalt, sodium and
cyan, and she whispers "That wasn't a drop."

Stop after the board. Stills before clips.
```
