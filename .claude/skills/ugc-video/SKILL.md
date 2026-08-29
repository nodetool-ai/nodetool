---
name: ugc-video
description: Direct phone-shot video with a person in it — UGC ads, creator testimonials, review-to-hero spots, comedy sketches, day-in-the-life and ritual pieces, first-person travel vlogs. Use when the user wants a video that looks self-filmed or friend-filmed, mentions UGC, TikTok, Reels, a creator, a testimonial, a talking-head ad, or names a person as the subject of a multi-shot video. Not for polished product films (use product-commercial) or narrated b-roll with no talent (use script-video).
---

**Load `/storyboard-core` first.** It carries the loop, the tool contract,
the entity rules and the gating this skill assumes. Everything below is what is
different about a phone-shot piece with a person in it.

## What makes this job type its own

The face is the deliverable. One character entity has to survive every shot, and the
look has to read as a phone rather than a camera. Both are set once, on the board, and
never re-argued in shot text.

## Casting comes first, and it is two passes

There is no create-from-text, and a face you have not seen is a face you cannot lock.

1. `find_model` (`text_to_image`) → `generate_image` with the character description
   alone: age, build, skin, hair, no wardrobe, no set, front-lit, neutral expression.
2. Show it. If the user likes it, `create_entity {asset_id, kind: "character", name,
   descriptor}`. The descriptor is the face and hair only.
3. After the first board stills come back, if a frame reads better than the reference,
   `update_entity {entity_id, asset_id}` to move the entity onto that crop. Do this
   **before** clips, not after.

Given a photo instead: save it as an asset, then `create_entity` from it. Write the
descriptor from the face and hair in the photo and **leave the photo's outfit out** —
wardrobe belongs in shot text, so the same entity can wear a gym set in one board and
a coat in the next.

## The look goes in the board style, once

Put the camera pretence in `style` via `set_board`, never in each shot:

| Register | `style` |
|---|---|
| Front-camera UGC | `handheld front-camera iPhone, mild shake, autofocus hunt, compression grain, window daylight, no beauty filter` |
| Friend-filmed | `handheld phone at arm's length, natural wind and room noise, slightly off-level framing` |
| Old-phone ritual | `old iPhone 1x, propped static angle, fluorescent tint, heavy noise` |
| Vlog | `chest-height phone gimbal, wide lens, natural light, mild bloom` |

No music, no score, no burned-in captions. Natural audio is part of the register — say
so in the brief so the video model does not add a bed.

## Shot pattern

Five to eight shots. A hook in the first four seconds, a middle that shows the thing
happening physically, and a verdict to camera.

- **Dialogue is a shot field**, not part of `action`. Set `dialogue` so
  `extract_script_from_storyboard` can lift the words later if the user wants them
  voiced properly.
- Write the physical beat in `motion` with a **count**: `two short spray bursts`,
  `two head turns`, `she lifts one section of hair and lets it fall, once`. "She
  reacts" renders as nothing.
- A talent-free end card (pack hero, logo card) needs its own `entity_ids` naming the
  product alone — otherwise the character's descriptor seasons a shot she is not in.
- Native-audio video models are weakest on their image path. For a shot whose spoken
  line has to look synced, set `render_mode: "direct"` and put the framing and style
  into the action text, since no still carries them in.

## Wardrobe and state

One outfit per piece unless the script changes it on camera. A wet, stained or
changed-outfit version of the same person is a **second entity** — cast it the same
way and name it in the shots where it applies.

## Briefs

`references/briefs.md` has four written to these rules: review-to-hero UGC ad,
Pinterest-fail comedy, locker-room ritual, and a night-city vlog with a shot-collapse
step. Replace the bracketed placeholders and hand one over after the standing orders.
