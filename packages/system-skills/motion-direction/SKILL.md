---
name: motion-direction
description: Set the motion language for a piece before anything is animated — one easing family, one timing unit, one transition family, one stagger rhythm — and audit a timeline against it. Use when starting a title pass or a whole cut, when animation feels busy, cheap or inconsistent across shots, or when turning a brand or brief into motion rules an agent can follow. Not for individual clip mechanics — that is motion-graphics.
---

# Motion Direction → the rules everything else obeys

Direction is the judgment layer above craft. It turns a brief into a short set of
motion rules, so every shot reads as one hand. Most of the work is subtraction:
deciding what does not move.

`motion-principles` gives the numbers. This decides which numbers the whole
piece is allowed to use.

## The one rule

Lock the motion language first, then animate to it. Pick **one** of each row
below and reuse it. Consistency reads as confidence; variety reads as noise. When
in doubt, repeat rather than invent.

## The motion-language spec

Fill every row once, at the top of the job, and state it back to the user before
you animate. Each row is a value an `edit_timeline` call takes.

| Row | Pick one | Example |
|---|---|---|
| Easing family | The `easing` string for roughly nine moves in ten | `cubic-bezier(0.22,1,0.36,1)` |
| Base timing unit | The atomic `durationMs`; everything else is a multiple | 400 — micro 200, hero 800 |
| Transition family | Which of the six cuts this piece uses | `crossfade` only, hard cuts elsewhere |
| Stagger rhythm | One `offsetMs` and one `from` | 80ms, `from: "start"` |
| Motion intensity | The travel, scale and overshoot budget | `distance` ≤ 0.15, `overshoot` ≤ 1.05 |
| Hold discipline | Minimum stillness between moves | ≥ 400ms with nothing animating |
| Type family | One bundled font | `Inter` for UI, `Bebas Neue` for a title card |

Two easings maximum: one for entrances and landings, one for exits. A third has
to justify itself.

## Tone and energy

Place the piece on two axes and commit. Mixing cells inside one piece is the
usual cause of "inconsistent".

| | Soft (organic, eased) | Sharp (precise, snappy) |
|---|---|---|
| **Calm** | Luxury, wellness, editorial: long windows, generous holds, minimal stagger | Premium tech, finance: deliberate, clean, unhurried, no overshoot |
| **Kinetic** | Lifestyle, playful, kids: overshoot and spring, loose timing | Sports, hype, gaming: short windows, hard cuts, accents on beats |

## Motion personality

The named preset that fills the spec's easing, timing and intensity rows. Pick
one per project and hand it to every later step by name.

| Personality | `durationMs` | `easing` | Overshoot | Presets it lives on |
|---|---|---|---|---|
| **Playful** | 150–300 | `easeOutBack` or `cubic-bezier(0.34,1.56,0.64,1)` | `overshoot` 1.1–1.2 | `pop`, `bounce`, `squash`, `float` |
| **Premium** | 350–600 | `cubic-bezier(0.4,0,0.2,1)` | none | `fade`, `blur`, `kenBurns`, `breathe` |
| **Corporate** | 200–400 | `cubic-bezier(0.2,0,0,1)` | `overshoot` ≤ 1.03 | `fade`, `slide`, `wipe` |
| **Energetic** | 100–250 | `easeOut` with short windows | `overshoot` 1.15–1.3 | `pop`, `flash`, `shake`, `spin` |

Premium sits calm-soft, Corporate calm-sharp, Playful kinetic-soft, Energetic
kinetic-sharp. Default to Corporate for product and Playful for lifestyle.
`easeOutElastic` and `easeOutBounce` belong to Playful alone.

## Motion hierarchy

Rank every element, animate down the list, and stop early.

| Tier | What it is | How it moves |
|---|---|---|
| Hero | The one thing the moment is about | The boldest, longest, most-eased move; lands on the beat |
| Support | Context that helps the hero land | Smaller and faster, out of the way, never competing |
| Texture | Bed, grain, ambient drift | A `loop` preset at low amplitude; no hard events |

These are the three layers `motion-principles` names Primary, Secondary and
Ambient. If two elements compete for the eye in one frame, the direction failed:
demote one before touching its keyframes.

Hierarchy is also a track decision. Lowest track `index` renders on top, so the
hero belongs on a low index and the bed on a high one; a scrim sits between the
picture it darkens and the text it carries.

## Restraint

For every element ask whether the motion carries meaning. If not, hold it still.

- Do not animate the whole frame at once. Leave the eye an anchor.
- Do not stack a transition on a transition — a `wipe` cut under a `spin` in
  under a `flash` is three ideas competing for 500ms.
- Do not loop-animate text somebody is still reading.
- Do not give overshoot to serious content.
- One outsized moment per piece. A second cancels the first.
- A clip that both dissolves in and carries a `fade` in ramps twice and reads
  slower than either alone. Pick one.

## Pacing

Map energy across the whole timeline before timing any single move: a low open,
a build, one peak, a settled end. Vary it on purpose — tension, then release.
Stillness is pacing, not a gap. `beat-sync-editing` turns this shape into cut
points.

## Direction notes, per shot

Write intent, not keyframes. One line per shot is enough for someone else — or a
later turn — to animate it:

> Shot 3, 4s. Hero: the price plate, `pop` in on the downbeat, Corporate.
> Support: the caption 80ms behind it, `fade`. Texture: bed holds `kenBurns`
> from shot 2. Nothing else moves.

## The consistency audit

Before calling a pass done, read the document back with `get_timeline` and check
every clip against the spec. A miss is a direction defect, not a preference.

- Same easing family on comparable moves, and no stray `linear` outside loops.
- Every `durationMs` a multiple of the base unit.
- Only the chosen transition types on the cut.
- One `offsetMs` and one `from` across every staggered clip.
- Hold discipline respected: no two moves stacked with no rest between them.
- Exactly one hero animating at any instant.
- One font family, and it is a bundled one — `Inter`, `Space Grotesk`,
  `Bebas Neue`, `Playfair Display`, `Lora`, `JetBrains Mono`. Anything else
  reports `font_not_portable` and resolves differently per host.

Then look: `preview_timeline_frame` over the midpoints of the moves you just
audited. An audit that only read the document has checked the spec, not the
picture.
