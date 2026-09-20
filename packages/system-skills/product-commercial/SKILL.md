---
name: product-commercial
description: "Direct a polished product film or brand commercial in NodeTool. For phone-shot creator ads, use ugc-video."
---

**Load `/storyboard-core` first.** It carries the loop, the tool contract,
the entity rules and the gating this skill assumes. Everything below is what is
different about a camera-grade product film.

## What makes this job type its own

There is no face to hold steady, so the thing that drifts is the **pack**: label
geometry, cap, proportions, colour. That is what the product entity is for, and it is
why the reference image matters more here than the descriptor.

The other difference is that a product film's shots are mostly about **light**, and
light lives in the board style, not in the shot.

## Casting the pack

The user's pack shot is the entity. Save the attached image as an asset, then
`create_entity {asset_id, kind: "prop", name, descriptor}`. Write the descriptor as
geometry and finish — `squat 200ml amber glass cylinder, brushed gold screw cap,
single centred cream label, serif wordmark` — not as marketing copy.

Never invent a logo, a tagline or a label layout. If the label has to be readable, say
so in the shot's `action` and give that shot a macro framing. Inspect the still
before rendering its clip. If the label remains unreadable, retry only within the
user's retry and spending limits. With no retries authorized, report the defect
and follow the remaining requested stages without claiming the label is readable.

Given several angles (front, three-quarter, back, top), tag the best single hero angle
as the entity and keep the rest as plain assets — only the first reference image rides
into the prompt.

## The look goes in the board style, once

| Register | `style` |
|---|---|
| Luxury studio | `black cyclorama, one warm key, gold rim, volumetric mist, 85-100mm, 24fps, no grain` |
| Clean e-comm | `white sweep, soft top light, even fill, 50mm, no shadow detail loss` |
| Location / lifestyle | `90s print / 35mm commercial, hard noon sun, mild bloom, no other brand marks` |
| Dark technical | `graphite surface, hard side key, specular edges, controlled falloff` |

Add `no on-screen type` to the style. Video models letter badly, and titles belong on
the timeline as text clips (`edit_timeline` → `add_text_clip`), where they stay
editable.

## Shot pattern

Use the requested shot count. When the brief leaves it open, five to seven shots
are a starting pattern. Give each cut a distinct purpose. A product film reads as expensive
when the **light** moves and the pack does not — write that literally:
`the light streak crosses the glass, the bottle stays still`.

- Put the move in `motion` with a distance or a degree: `slow 8cm push-in`,
  `low 30-degree orbit`, `rack focus from cap to liquid`.
- Give the last shot a **hold**: `last 1.2s dead hold` — models drift on the tail, and
  a hold is what makes an end card usable.
- Count the physical events: `two condensation beads run`, `one ripple, then still`.
- On a location spot with talent, cast the person as a character entity per
  `/ugc-video`'s casting pass, but keep the pack's shots free of them with an
  explicit `entity_ids`.

## Where a still is the wrong unit

Macro glass, mist and specular highlights are where `keyframe` mode pays — the still
is cheap and you can judge the light before spending on motion. Keep the default.

Switch a shot to `render_mode: "direct"` only for heavy motion the first frame would
stiffen: a fast orbit, liquid pouring, an explosive reveal. Then the framing and style
have to go into the action text, since no still carries them in.

## Briefs

Adapt these examples to the user's brief. Example deliverables, style choices,
and approval checkpoints apply only when the user adopts them.

**Briefs** below has two: a 10s luxury pack shot with no talent, and a 30s
street CPG walk with a character. Replace the bracketed placeholders and hand one over
after the standing orders.

## Briefs — product film

One per message, after the standing orders from `/storyboard-core`. Replace
`[PRODUCT]` and `[CITY]`. `Nova` stands for the character entity's **plain name**.

---

### Luxury pack shot, 10s 16:9

```
Direct a 10s 16:9 luxury commercial. [PRODUCT] only, no talent, no type.

Cast the pack from the attached shot: save it as an asset, then tag it as a prop
entity. Descriptor is geometry and finish, not copy.

Board style: black cyclorama, one warm key, gold rim, volumetric mist, 85-100mm,
24fps, no grain, no on-screen type.

1a 0-2  macro. A light streak crosses the glass, two condensation beads run.
        The light moves, the pack does not.
2a 2-4  the bottle rises onto black acrylic, key holds.
3a 4-6  low 30-degree orbit, label readable at the midpoint.
4a 6-8  rack focus from cap to liquid, one ripple, then still.
5a 8-10 pull back to a centred hero, key lifts ten percent, last 1.2s dead hold.

Stop after the board. Stills before clips.
```

### Street CPG walk, 30s 16:9

```
Direct a 30s 16:9 street commercial in [CITY] for [PRODUCT] with Nova.

Cast both: the pack from the attached shot as a prop entity, Nova as a character
entity from a generated reference you show me first.

Board style: 90s print / 35mm commercial, hard noon sun, mild bloom, no other
brand marks, no on-screen type.

1a 0-4   fisheye on a boom, Nova walking cobbles, [PRODUCT] in hand, long shadow
2a 4-8   shoulder track, one bite or sip
3a 8-12  POV from inside the cup or wrapper, a building cornice behind
4a 12-16 low wide at a crosswalk, one unbranded taxi crosses
5a 16-22 she stops and turns once, the pack reads
6a 22-27 she leans to the lens, a small late smile. One line, this shot only.
7a 27-30 the pack alone on a cafe table, street bokeh, one-second push, dead
         hold on the tail. entity_ids: the product only.
```
