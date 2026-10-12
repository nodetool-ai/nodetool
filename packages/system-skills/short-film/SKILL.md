---
name: short-film
description: "Direct a narrative scene or short film in NodeTool with characters, dialogue, and score, and the look and cast of a story trailer. A trailer's beat structure comes from trailer-template. For product ads, use product-commercial."
---

**Load `/storyboard-core` first.** It carries the loop, the tool contract and
the gating this skill assumes. Everything below is what narrative work adds on top.
For a trailer or teaser, also load `/trailer-template`: it sets the eight beats, the
drop and the title card, and this skill sets the cast, the look and the blocking.

## What makes this job type its own

An ad needs a board. A narrative piece needs the **screenplay framing** around it:
title, logline, style bible, narration and a music prompt. Those live on the board's
screenplay.

Who writes which field:

| Field | Headless | Board open in a tab |
|---|---|---|
| narration, music prompt | `edit_storyboard` → `set_board {narration, music_prompt}` | either |
| style bible | `set_board {style}` (the board style is the style bible) | either |
| title, logline | only through `direct_storyboard`, which writes the Director's own | `ui_storyboard_set_screenplay` |

So:

- Board open in a browser tab → `ui_storyboard_set_screenplay` with the whole
  screenplay object, framing and shots together, in one call.
- Headless → `create_storyboard`, then `set_board` with the look in `style`, the
  premise in `brief`, and `narration` and `music_prompt`. Keep the words on each shot's
  `dialogue` and `narration`. A title and logline of your own need the board open;
  say so rather than pretend they were set. To have the Director write the whole
  screenplay headless, scenes and title included, `set_setup {brief, genre}` and then
  `direct_storyboard`.

This matters at assembly: `assemble_storyboard_timeline` turns the screenplay's
narration and music prompt into draft audio clips ready to generate.

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
a still. Set those shots to `render_mode: "direct"`; the direct clip prompt carries
the camera fields, the scene lighting and the board style itself. Keep the establishing and static
shots on `keyframe` — they are the ones where holding the look matters most.

## Brief

Adapt these examples to the user's brief. Example deliverables, style choices,
and approval checkpoints apply only when the user adopts them.

```
Direct a 40-second [genre] short: [LOGLINE]. Six shots, open wide, end close,
5-8 seconds each.

Write the full framing as well as the shots: title, logline, style bible,
aspect ratio, and a music prompt. If the board is open in a tab, set all of it
with ui_storyboard_set_screenplay in one call; if not, set the style, narration
and music prompt with set_board and tell me the title and logline need the tab.

Cast every character as an entity from a reference you show me first, plus a
location entity for the street. Set the shots that carry spoken lines to
render_mode direct.

If I gave no logline: a night courier loses the package. Wet asphalt, sodium and
cyan, and she whispers "That wasn't a drop."

Stop after the board. Stills before clips.
```
