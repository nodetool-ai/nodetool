---
name: trailer-template
description: Structure a trailer or teaser as eight audio-first beats — hook, setup, inciting incident, escalation, drop, climax, title, button — with a runtime-scaled timecode grid, event/reception shot pairs, a planted-and-harvested motif, and one unbroken music bed, then store it as a NodeTool storyboard with a character entity behind every recurring face. Use when someone asks for a trailer, teaser, sizzle or announcement cut structure, says a cut has no spine or no build, or needs to know where the drop and the title card go. Not for ads (commercial-beat-sheet) or music videos (music-video-treatment).
---

You are a single agent. Take a title, a genre and a runtime and produce a complete, timecoded trailer plan as a NodeTool storyboard. You call the storyboard, entity and timeline capabilities directly. You do not build a workflow. You do not render or assemble unless asked.

Fill the header first. Every field below is required and none is guessed — a fact you do not have is `[CLIENT INPUT NEEDED]`.

```text
TITLE:
GENRE:
LENGTH:           [seconds]
FORMAT:           16:9 / 2.39:1 / 9:16
THESIS:           [the one idea the trailer argues, one sentence]
CENTRAL QUESTION: [the question left OPEN at the end]
MOTIF:            [recurring visual element — hands, doors, water, mirrors]
                  Planted in SETUP, paid off in PEAK or BUTTON.
```

---

## Two principles nothing overrides

**Event → reception.** The unit is a pair, never a single shot. Something happens, then a face receives it. Meaning lives in the second shot. An escalation section without receptions is world-building, not escalation.

**Audio is the clamp.** The picture is discontinuous — shots from different scenes, places and times. The sound is one unbroken bed across the whole runtime, and that bed is what makes the fragments read as one thing. Never cut the audio to silence. Dip it.

---

## The dynamic curve

```text
  quiet / slow  ~65%          |  loud / fast  ~35%
  ─────────────────────────── DROP ──────────────────────
  Beats 1–4                   |  Beats 6–8
```

One hinge. The drop lands at **~65% of runtime**. Everything else is subordinate to this curve.

**Minimum perceptual durations** — below these a beat does not read:

| Beat | Minimum |
| --- | --- |
| Drop | 1.0s |
| Setup | 4.0s |
| Button | 2.0s |
| Any reception shot | 0.8s |

**Compression rule.** Below 25s the proportions break, so a short trailer **fuses** beats rather than shrinking all eight. Fusion order: Hook + Setup merge → Inciting + Escalation become one build → the Drop stays untouched → Button merges into Title.

---

## Beat budget

Compute timecodes from the runtime, rounded to 0.5s. Check every beat against its minimum after rounding, and fuse per the rule above when one falls under.

| Beat | % of runtime | Job |
| --- | --- | --- |
| 1 Hook | 0–8% | Interrupt. Open an information deficit. |
| 2 Setup / World | 8–25% | Install identification. The normal state as precious or fragile. Plant the motif. |
| 3 Inciting incident | 25–32% | One nameable event turns the state into a problem. |
| 4 Escalation / Stakes | 32–65% | Accumulate. Each unit raises a new dimension. Longest section. |
| 5 Drop | 65–68% | The hinge. Maximum contrast, not maximum volume. |
| 6 Climax / Peak | 68–85% | Payoff as fragments. The emotional summit is a human beat inside the spectacle. |
| 7 Title card | 85–90% | Name the feeling. Lands on the impact. |
| 8 Button / Stinger | 90–100% | Recency. One small, single beat that works without context. |

---

## The eight beats

### Beat 1 — Hook

Event before face. No genre marker yet. Never explain. Start quiet — opening loud burns the dynamic range the drop needs.

| type | shot |
| --- | --- |
| event | a phenomenon with a timestamp — a thing that **happens**, not a state |
| reception | a face receiving it. Attention, not yet fear. |

### Beat 2 — Setup / World

Not plot: an emotional anchor. Show the normal state as precious or fragile, or its destruction means nothing. Plant the musical motif here; you harvest it at the climax. If two characters will conflict later, stage one **disagreement** beat now — otherwise their conflict is asserted, not prepared.

| type | shot |
| --- | --- |
| setup | protagonist in the normal state — warm, ordinary, specific |
| setup | intimacy or fragility — a small physical gesture, the **motif** planted |
| setup | disagreement — two positions, silently staged |

### Beat 3 — Inciting incident

One identifiable event, never a montage. If the viewer cannot name what changed, the trailer has no spine. First real impact — it works because you spent none before. Impacts are currency: spend them ascending.

| type | shot |
| --- | --- |
| event | the turn — one nameable event |
| reception A | character 1 reads it as `[reading A]` |
| reception B | character 2, the **same** event, reads it as `[reading B]` — the thesis in two faces |

### Beat 4 — Escalation / Stakes

Accumulate, never repeat. Tension is a function of duration, so this is the longest section. The reveal ratio climbs like a ladder and never completes. **Every event needs a receiver.** Ladder the dimensions: intimate → social → institutional → domestic → personal.

| type | shot | dimension |
| --- | --- | --- |
| event | scale widens — the world notices | society |
| reception | a stranger's face | |
| event | institutions respond | state |
| reception | the protagonist's protector reacts — fear turns domestic | |
| event | the threat enters the home | intimate |
| reception | the protagonist chooses — a small physical act of crossing | |
| reception | stakes crystallize — someone realizes what they have lost | |

### Beat 5 — Drop

The hinge between question and promise. Not the loudest moment: the moment of maximum **contrast**. You are not making silence, you are manufacturing headroom, and it must land on an image worth the pressure. Under 1s it reads as an edit error, not a pause.

| type | shot |
| --- | --- |
| DROP | stillness. The single best held image. Small figure, vast unseen force. |

### Beat 6 — Climax / Peak

Payoff as fragments, never answers. Highest kinetic energy, but the summit is a human beat inside the spectacle — spectacle without a face is noise. Consequence, never outcome. The motif from Beat 2 returns in full orchestration.

| type | shot |
| --- | --- |
| climax | the face — emotion rising, readable |
| **PEAK** | the emotional summit — the motif paid off, in granular sensory detail |
| reversal | optional: everything snaps out — the sudden absence |

### Beat 7 — Title card

The title arrives at maximum emotional charge so the name and the feeling weld. It lands **on** the impact, not after — sound and type in the same frame.

### Beat 8 — Button / Stinger

The last thing is what gets carried out. Controlled discharge plus a residue that makes the film specific instead of generic — this is where you tell the truth about the genre. Small and single after the bigness, and it must work without context. Advanced move: put the biggest reveal here, after the title, when the audience thinks it is over.

| type | shot |
| --- | --- |
| BUTTON | one last beat — punchline, scare, tenderness or reveal. Deny the expected hit. |

---

## Audio bed — one unbroken track

```text
[Hook]        sub-bass drone + ambience + ONE distant tonal element
[Setup]       THE SEED: fragile motif enters — instrument: [INSTRUMENT]
[Inciting]    motif bends. First impact. Sub grows.
[Escalation]  layers stack: pulses → riser → strings. Accelerating.
[Drop]        ★ DIP to bare sub-rumble. Never fully out.
[Climax]      THE HARVEST: motif returns fully orchestrated + choir/strings bloom
[Title]       one sustained luminous chord + sub-boom → title
[Button]      minimal. Withhold the stinger hit if the button is tender.
```

**Cut on the transient.** Picture cuts land on hits, not between them. **Sound design over music at impact.** The braam carries the blow, the score carries the emotion.

---

## Entities

Any character in more than one shot is a **character entity**, or you get a different person every time. The protagonist, the protector and whoever carries reception B usually make three. A recurring home is a **location** entity, the grade a **style** entity, the motif object (if it is an object) a **prop**.

```js
import { list_entities, create_entity } from "@nodetool-ai/sandbox-nodetool/entities";

await list_entities({});   // reuse before you generate

const still = await nodetool.media.generateImage(
  "<the character, neutral background, in the trailer's grade>",
  await nodetool.models.pick("text_to_image")
);
await create_entity({
  asset_id: still.asset_id,
  kind: "character",
  name: "<Name>",
  descriptor: "<one to two dense sentences describing exactly what the reference shows>"
});
const entityId = still.asset_id;   // the entity IS its asset
```

The descriptor is the face. Name entities in plain text in a shot's `action` or `motion` — "Mara turns from the window", never `@Mara` — and do not re-describe them in shot text. The render attaches a character or prop entity to a shot only when its name appears in that shot's text (style and location entities always apply), so a reception shot that says "she" instead of "Mara" renders a stranger. Show the roster before drafting beats.

---

## Storyboard

### 1. Create the board

```js
import { create_storyboard, edit_storyboard } from "@nodetool-ai/sandbox-nodetool/storyboards";

const board = await create_storyboard({
  name: `${title} — trailer (${runtime}s)`,
  brief: `${thesis}\nCENTRAL QUESTION: ${centralQuestion}\nMOTIF: ${motif}`,
  style: "<the grade in one line>",
  aspect_ratio: "16:9"
});
const boardId = board.storyboard_id;   // NOT board.id
```

### 2. Roster and models

`edit_storyboard` takes five ops: `add_shot`, `update_shot`, `remove_shot`, `reorder_shot`, `set_board`. `set_board` accepts `{brief?, style?, aspect_ratio?, entity_ids?, image_model?, video_model?}` and refuses anything else. Models come from `find_model` — pass each result's `.ref`; there is no default, and an unset model fails the render. The full contract, including which entities each shot's prompt receives, is in `commercial-beat-sheet` § Tool contract.

```js
const stills = await find_model({ capability: "text_to_image" });
const clips = await find_model({ capability: "image_to_video" });
await edit_storyboard({
  storyboard_id: boardId,
  ops: [{ op: "set_board", entity_ids: roster,
          image_model: stills.ref, video_model: clips.ref }]
});
```

Each result also names a `prompting_skill`. Load it before step 3: the shot `action` and `motion` are the prompt the generator reads (`motion` first, then `action`, for a clip), and a trailer's receptions and its drop are worded differently for a line that wants beats in order (Hailuo), a shot list (Kling) or a sound brief (Seedance).

### 3. One shot per row

Every row in the beat tables is one `add_shot`. The slug carries the beat and the type, so the pair structure survives into the board and the cut.

```js
await edit_storyboard({
  storyboard_id: boardId,
  ops: [{
    op: "add_shot",
    slug: "3-event",                     // <beat>-<type>: 1-event, 1-reception, 3-reception-a, 5-drop, 6-peak, 8-button
    action: "INCITING (0:09–0:10.5): the turn — <one nameable event>, Mara in frame",
    camera: { framing: "close", lens: "50mm", angle: "eye", movement: "static" },
    motion: "<what moves, with counts — 'she looks up once', not 'tense'>",
    duration_seconds: 1.5,
    render_mode: "keyframe"
  }]
});
```

Rules for the shot text:

- `action` opens with the beat name and timecode, then the shot. Under 400 characters.
- A reception shot's `action` names whose face it is and what it reads. Its `motion` is a single small physical event.
- The drop shot's `motion` is stillness, stated: "nothing moves except the water".
- The title card and any on-screen text are **not** shots. Type goes in post (`caption-titles`), because generators render text unreliably.
- `render_mode: "direct"` only for a heavy-motion climax shot. Receptions and the drop stay on `keyframe`, where the face holds.

### 4. The audio bed lives on the board, not on the shots

Put the eight-line bed into the board's `brief` as a `MUSIC:` block, one line per beat with its timecode. Per-shot `narration` stays empty — native per-shot audio is fragments, the opposite of the clamp. If the board is open in a tab, `ui_storyboard_set_screenplay` writes the same text into `musicPrompt`, and `assemble_storyboard_timeline` then turns it into a draft music clip.

---

## Pre-delivery check

Run before showing anyone. Every line must be true of the board, not the plan.

- [ ] Hook is event before face, no genre marker
- [ ] Every escalation event has a reception shot
- [ ] Setup shows the normal state as precious or fragile
- [ ] Disagreement beat present if characters conflict later
- [ ] Motif planted in Beat 2, harvested in Beat 6
- [ ] Drop sits at ~65% and lands on an image worth the pressure
- [ ] Emotional summit is not on the spectacle shot
- [ ] Title lands on the impact, same frame
- [ ] Button is small, single, works without context
- [ ] Audio never cuts to true silence — dips only
- [ ] Central question still open at the end
- [ ] No beat below its minimum perceptual duration
- [ ] Every face appearing twice is an entity on the board

---

## Render and cut (only on request)

**Stills first.** `render_storyboard_stills` costs cents and you look at them. A wrong face is fixed at the entity, never in one shot's prompt.

**Generate every clip long.** Ask the video model for 4–5s per shot even where the plan says 1.5s — you want frames to choose from — and trim in the timeline. `render_storyboard_clips` has no duration override, so bump `duration_seconds` on `update_shot` before the render and restore it after. Shots render individually and mute their own audio; `analyze_video` on each clip gives the real length before you trim, because the model honours the request loosely.

**The bed is one clip.** After `assemble_storyboard_timeline`:

1. `generate_music` once, for the full runtime, from the eight-line bed. One prompt, one clip.
2. `edit_timeline` → `add_track` (audio), then `add_media_clip` for that one asset at 0:00. Remove any draft audio clips the assembly created per shot.
3. `detect_audio_events` on the bed, then `beat-sync-editing`: every picture cut moves to the nearest transient. The drop shot's in-point sits on the dip.
4. The dip is a volume keyframe on the bed, not a cut. Never a gap.
5. `caption-titles` for the title card, timed to the same frame as the title impact in the bed.
6. `validate_timeline`, then `preview_timeline_frame` at the drop, the peak and the title.

`motion-graphics` carries the timeline op contract, `video-audio-continuity` the case where a shot's own sound has to survive, `color-motion` the grade that makes shots from different scenes cut together, and `logo-reveal` a studio mark after the button.
