---
name: commercial-beat-sheet
description: Write a shootable, precisely timed commercial beat sheet and store it as a NodeTool storyboard, with a consistent entity roster behind every shot. Use when someone needs ad structure — hooks, beats, timecodes, VO — rather than a finished render.
---

Take a product brief and produce a complete, shootable commercial beat sheet as a NodeTool storyboard. Call the storyboard and entity capabilities directly; build no workflow.

This skill is the ad's structure. Pair it with a job skill for the look: `product-commercial` for a polished product film, `ugc-video` for a phone-shot creator ad. A product page URL that should end as a finished cut is `launch-commercial`; a sound-off animated ad built from the product's real screenshots is `motion-ad`.

---

## Role

Write as a commercial director: shootable, precisely timed, built for retention. The first 3 seconds matter most. Escalate one problem. Demonstrate mechanisms, not benefits. Close every loop you open. Never invent brand facts — write `[CLIENT INPUT NEEDED]` instead. Obey the runtime budget on every word. Keep the visual language consistent: the can looks the same in beat 2 and beat 8, the protagonist's face reads the same across every shot they appear in, the room is the same room in the open and the close.

---

## Entities (production consistency)

Every recurring subject — the protagonist, the product, the pack, the location, the brand mark — is an **entity**: a named production asset with a **reference image** (the source of truth) and a **descriptor** (prose describing exactly what that image shows). The model uses descriptor + reference to keep the subject identical across shots.

| Kind | Use for | Extra fields |
| --- | --- | --- |
| `character` | Anyone appearing in two or more shots | `voice_id` for VO casting |
| `location` | The recurring environment | — |
| `style` | A look that must hold across shots | `palette` (hex), `lora` |
| `prop` | The product, the pack, the hero object | — |

Never generate a storyboard before the roster is resolved. Without entities, beat 2's can and beat 8's can drift, the protagonist's face changes between hook and CTA, and the briefed style is a suggestion the model may ignore.

**Headless tool names.** `list_entities`, `get_entity`, `apply_entities`, `create_entity`, `update_entity`, `delete_entity` from `@nodetool-ai/sandbox-nodetool/entities`. The `ui_entity_*` tools need a browser with the document open — do not reach for them here.

**Ids.** `create_entity` returns `{entity}`; an entity's id **is the asset id you passed in**. Do not read `.id` off the result.

**Which entities a shot's prompt receives.** The render does not send the whole roster to every shot. Per shot it applies the style and location entities always, plus every character and prop whose **name appears in the shot's text** (`action`, `motion`, `dialogue`, `narration`, `slug`, case-insensitive). That is why the shot text names entities in plain words — `[Protagonist]` works because the word is there, `@Protagonist` or a pronoun does not. To override the match, `add_shot` / `update_shot` take an explicit `entity_ids` list for that shot, and then only those apply.

---

## Tool contract

The storyboard, entity and render call shapes live in `storyboard-core` § Tool contract: all fifteen `edit_storyboard` ops, every key `set_board` accepts, and which fields each prompt receives. `load_skill` it before the first board call. `explainer-storyboard`, `music-video-treatment`, `trailer-template` and `launch-commercial` build their boards with the same calls. What this skill relies on:

- `create_storyboard` returns the id as `storyboard_id` (and as `id`). `create_entity` returns `{entity}`; the entity's id is the `asset_id` you passed in. `nodetool.media.generateImage` returns `.asset_id`.
- The render calls take `provider` + `model` and fall back to the board's `image_model` / `video_model`. With neither, the call fails and says so. It never picks one.
- `render_storyboard_clips` sends the shot's `duration_seconds`, and the model snaps it to the lengths it offers. A beat shorter than the model's shortest clip still buys the whole clip; `storyboard-core` § Fusing shots says when to fuse beats and when to render long and trim.
- **What the model reads.** The still prompt is `action`, the camera framing, angle and lens, the scene lighting and the board `style`, with the matched entities' descriptors and one reference image each. A keyframe clip prompt is `motion`, `action`, the camera movement and equipment. The beat sheet's SOUND DESIGN and MUSIC lines reach a native-audio model only through `action` or `motion`.
- **The chosen model line has its own prompting skill.** `find_model` returns `prompting_skill` on a route it covers; `load_skill` it before writing `action` and `motion`, because the same beat is worded differently for Seedance (verbs and a sound brief), Kling (a shot list, tagged elements), Hailuo (beats in order, no negatives) or Veo (a five-element shot description). The image line for the stills has one too.

---

## Brief (collect from the user, never invent)

```text
PRODUCT / SERVICE:
BRAND:                  [name + 3 personality traits]
CATEGORY:
TARGET AUDIENCE:
CORE PAIN:
USP:
PROOF ASSETS:
CTA:
TOTAL RUNTIME:          [15s / 30s / 60s / 90s / 180s, or the user's own]
PLATFORM:
TONE:
ENTITIES:               [characters / locations / props / style]
MANDATORIES:
FORBIDDEN:
```

A fact that cannot be known is `[CLIENT INPUT NEEDED]` in the storyboard, never a guess.

---

## Entity discovery (between brief and beat sheet)

Three sources, in priority order:

1. **User-provided** — use verbatim, do not regenerate.
2. **Existing in the library** — `await list_entities({})` before creating anything. A re-cut of a spot already has its can, its pack, its logo and probably its protagonist. Reuse is almost always what the user wants.
3. **Generate the rest** — a reference still per missing entity, promoted with `create_entity`.

**Style first, always.** Create or fetch the style entity before anything else, then generate every other entity with it applied. Drift from one visual register to another is the most common consistency failure, and the style entity is what stops it.

```js
import { create_entity } from "@nodetool-ai/sandbox-nodetool/entities";
import { apply_entities } from "@nodetool-ai/sandbox-nodetool/entities";

const seasoned = styleId
  ? await apply_entities({ text: "<the entity, on a neutral background>", entity_ids: [styleId] })
  : { prompt: "<the entity, on a neutral background>" };

const still = await nodetool.media.generateImage(
  seasoned.prompt,
  await nodetool.models.pick("text_to_image")
);

await create_entity({
  asset_id: still.asset_id,
  kind: "character" | "location" | "style" | "prop",
  name: "<Entity Name>",
  descriptor: "<one to two dense sentences describing the reference image>",
  description: "<longer notes for future shots>",
  tags: ["brand", "..."],
  palette: null,        // style only: ["#000000", "#00f0ff", ...]
  lora: null
});
const entityId = still.asset_id;   // the entity IS its asset
```

**The descriptor is the most important field** — it is injected into every prompt that names the entity. Write it as a visual specification:

- **Character** — age range, build, hair, skin, distinguishing features, signature wardrobe. "Late-20s East Asian creative director, sharp jaw, undercut black hair, matte black technical bomber with a single cyan seam down the sleeve."
- **Location** — layout, materials, lighting, signature features. "Windowless after-hours studio, four 4K monitors, exposed concrete pillar, single cyan rim light from the left, carbon-fiber desk, no windows."
- **Prop** — exact geometry, materials, branding marks, condition. "Matte black slim 12oz aluminum can, 155mm tall, laser-etched angular wordmark mid-can, cyan glyph above it, 0g sugar callout at the base, chilled condensation beads."
- **Style** — medium, palette, lighting, lens signature. "Cyber-utilitarian commercial look, matte black backgrounds, cyan (#00F0FF) rim light only, no warm tones, hard specular highlights, shallow depth of field at f/1.8."

A 30s spot usually needs 4–6 entities: 1 style, 1–2 characters, 0–1 location, 1–2 props. A 15s spot may need 3. More than 8 is over-engineered.

Show the roster before drafting beats. Once a beat sheet cites an entity, its reference image is the source of truth, and changing it later means re-rendering every shot that uses it.

---

## Beat budget

Compute timecodes from the runtime, rounded to the nearest 0.5s.

| Beat | % of runtime |
| --- | --- |
| **Hook** | 0–4% |
| **Brand landing** | 4–10% |
| **Problem** | 10–30% |
| **Solution / USP** | 30–55% |
| **Proof** | 55–72% |
| **CTA** | 72–85% |
| **Reiteration** | 85–93% |
| **Closing** | 93–100% |

Pattern interrupts at every 5s boundary and at 25%, 50%, 75%. Total VO ≤ `runtime × 2.5` words. One deliberate silence immediately before the CTA.

---

## Deliverables, in order

1. **Three hooks + a recommendation** — three different archetypes, plus a ≤2-sentence recommendation.
2. **The full beat sheet** — every beat in the block format below.
3. **The entity roster** — id, kind, descriptor summary, and which beats reference each. This is the audit trail for visual consistency.

---

## Hook format

```text
ARCHETYPE: <one of the 8>
0:00–0:03: <shot by shot, max 3 shots>
LOOP OPENED: <the question this forces the viewer to answer>
SCROLL-STOP REASON: <why a thumb stops>
RISK: <what could feel off or alienating>
ENTITIES REFERENCED: <entity names visible in the hook>
```

**Archetypes** — pick three that are not the category default: Cold Contradiction · In Media Res Failure · Cost Reveal · Visual Impossibility · Interrupted Confession · Result First · Anti-Ad · Ticking Clock.

**Hook rules.** Start mid-action; no fade, logo, or establishing shot. The brand appears no earlier than 0:03 and never in the hook. One idea per hook. Visuals work muted, audio works without visuals. If the first three seconds would work for a competitor, rewrite.

---

## Beat sheet format

```text
─────────────────────────────────────
BEAT [#] — [NAME]
TIMECODE:        0:00–0:00 (0.0s)
DRAMATURGIC JOB: [one line]

SHOT 1
  FRAMING:
  VISUAL:
  ACTION:
  ENTITIES: [entity names visible in this shot]
SHOT 2 ...

VOICE-OVER:      "[verbatim, max 2.5 words/sec]"
DIALOGUE:        "[verbatim]"
ON-SCREEN TEXT:  [exact wording, max 5 words]
SOUND DESIGN:
MUSIC:
TRANSITION OUT:

WHY IT HOLDS:    [one sentence]
─────────────────────────────────────
```

The `ENTITIES:` line is the consistency contract: every entity named must exist in the roster, and every one must be applied to that shot's generation prompt.

---

## Craft rules

* Demonstrate mechanisms instead of claiming benefits.
* Concrete numbers and behavior over adjectives.
* One idea per shot.
* Verbs in VO, nouns on screen. Never duplicate.
* Escalate one problem. Never list multiple pains.
* Proof sits immediately after the claim it validates.
* One CTA only.
* The closing line pays off, ideally echoes, the hook.
* **Every shot's prompt applies every entity visible in that shot.**

---

## Execution

### 1. Collect the brief

Ask for any missing required field. Offer `15`, `30`, `60`, `90` or `180` seconds when the user names no runtime; a runtime they name stands.

### 2. Resolve the entity roster

A hard gate — do not move on until it is complete. Look in the library, reuse what is there, generate only what is missing, style first. Show the roster.

### 3. Compute the beat budget

Timecodes rounded to 0.5s; mark every 5s boundary and 25/50/75% as pattern-interrupt points.

### 4. Draft three hooks

Three different archetypes, each in the hook format. Recommend one in ≤2 sentences.

### 5. Draft the full beat sheet

For the chosen hook, every beat in the block format, matching step 3's timecodes, with a pattern interrupt on every flagged timecode, one deliberate silence before the CTA, and a closing line that echoes the hook.

### 6. Create the storyboard

```js
import { create_storyboard, edit_storyboard } from "@nodetool-ai/sandbox-nodetool/storyboards";

const board = await create_storyboard({
  name: `${brand} — ${product} (${runtime}s)`,
  brief: fullBriefIncludingEntities,
  style: oneLineToneSummary,
  aspect_ratio: aspectFromPlatform   // the PLATFORM field; 9:16 for vertical feeds, 16:9 otherwise
});
const boardId = board.storyboard_id;
```

### 7. Attach the roster and the models

The roster goes on `set_board`, and so do the board's default models — resolve them with `find_model` now so every later render call has a default, and read each result's `prompting_skill` before step 8.

```js
const stills = await find_model({ capability: "text_to_image" });
const clips = await find_model({ capability: "image_to_video" });
// .ref is {type, provider, id, name} — the object the board and the render read.
// .prompting_skill names the guide to load before writing shot text.
await edit_storyboard({
  storyboard_id: boardId,
  ops: [{ op: "set_board", entity_ids: roster,
          image_model: stills.ref, video_model: clips.ref }]
});
```

The render pipeline reads that list and applies, per shot, the style and location entities plus every entity named in the shot's text (see § Entities), so you do not pass them again.

### 8. Add one shot per beat

```js
await edit_storyboard({
  storyboard_id: boardId,
  ops: [{
    op: "add_shot",
    action: "<DRAMATURGIC JOB> — <shot summary, entity names in brackets>",
    camera: { framing: "...", lens: "...", angle: "...", movement: "..." },
    motion: "<what moves, how>",
    duration_seconds: <beat length, rounded to 0.5>
  }]
});
```

`action` is the board's first-class content: pack the dramaturgic job, the shots, VO and on-screen text into one dense line under 400 characters, naming entities in brackets.

```
HOOK (0:00–0:01.5): In media res failure. ECU of [Protagonist]'s hand trembling over a mechanical keyboard, spilling cheap neon soda. Text: YOUR ENERGY IS BROKEN.
```

Write `action` and `motion` the way the chosen model line's prompting skill says (the `prompting_skill` that `find_model` returned in step 7). The still prompt is this text plus the camera framing, angle and lens, the scene lighting and the board style; the keyframe clip prompt is `motion`, `action` and the camera movement and equipment. Camera direction goes in `camera`, not repeated in `action`. Put the beat's sound design into `motion` when the video line writes native audio.

On-screen text in `action` is a note for the cut, not a render instruction: supers, captions and the CTA card go on as text clips after assembly (`caption-titles`), because a generator letters unreliably and the copy has to stay editable.

Set `render_mode` per shot: `"keyframe"` (default) where a subject must hold steady, `"direct"` for a heavy-motion shot where first-frame conditioning renders stiff.

### 9. Season a prompt outside the board

The board's render pipeline applies its `entity_ids` automatically. For a test frame or an extra generated outside it, build the prompt the same way:

```js
import { apply_entities } from "@nodetool-ai/sandbox-nodetool/entities";

const seasoned = await apply_entities({
  text: shotAction,   // keep the [Entity] names: name matching reads them
  entity_ids: entityIdsForThisShot
});
// seasoned.prompt ends with a "Consistency references:" block;
// seasoned.reference_asset_ids are the images to pass as image inputs.
```

### 10. Render (only on request)

The default path stops at the planned board. When asked, keyframes first — stills cost less than clips, and you look at them before any clip renders. Report the shot count and models; no tool prices a render in advance:

```js
import { render_storyboard_stills, render_storyboard_clips } from "@nodetool-ai/sandbox-nodetool/storyboards";

await render_storyboard_stills({ storyboard_id: boardId, provider, model });
```

`provider` and `model` default to the board's `image_model` / `video_model` from step 7. With neither set nor passed, the render fails and says so — it never silently picks something. Pass them explicitly when one shot needs a different line than the board default.

A still that violates entity consistency (wrong face, wrong can, wrong look) is fixed at the **entity**: revise its reference and re-render every shot using it. Never paper over drift in one shot's prompt. A clip wrong where its keyframe was right is a **motion** problem: one `revise_storyboard_clip`.

### 11. Assemble (only on request)

```js
import { assemble_storyboard_timeline } from "@nodetool-ai/sandbox-nodetool/storyboards";

const timeline = await assemble_storyboard_timeline({
  storyboard_id: boardId,
  name: `${brand} — ${product} (${runtime}s) Cut`
});
```

From here the normal timeline tools take over, and each has a skill: `timeline-edit-ops` for the op contract, `motion-graphics` for the build loop, `video-audio-continuity` before any clip renders if the spot's sound has to run across the beats, `beat-sync-editing` to put the cuts on the music bed and ramp the hit, `caption-titles` for the supers and the CTA card, `logo-reveal` for the end mark, and `color-motion` for the grade that makes the beats cut together. Load `motion-direction` first if the spot needs one motion language across every beat.

---

## When the user has no brand assets yet

If the brief is "an energy drink called WARP" with no logo, no can render and no protagonist photo, you still build the board. Entity discovery *is* the generation of those assets: the reference stills double as mood-board frames the client can sign off, and the descriptors you write become the brand guidelines the next production pass inherits.
