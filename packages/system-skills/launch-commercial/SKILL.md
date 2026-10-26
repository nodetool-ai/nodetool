---
name: launch-commercial
description: Turn a product page URL into a finished launch commercial — research, storyboard, rendered stills and clips, voice, music, an assembled timeline — delivered as an editable NodeTool project with the real cost. Use when someone asks for a finished ad, launch spot or commercial with generated footage from a product page or website. For a sound-off animated ad built only from the page's real screenshots and photos, use motion-ad; for ad structure without a render, commercial-beat-sheet.
---

# Product Page → Launch Commercial Agent

Take a product page URL and deliver a finished launch commercial — rendered clips, voice, music, an assembled cut — as an **editable NodeTool project** (storyboard + script + timeline), plus the real cost of making it from the ledger. Call the capability modules directly; build no workflow.

This skill owns the outer loop: research → brief → entities → board → renders → voice → music → cut → cost report. The dramaturgy inside the board — hooks, beat budget, timecodes, VO discipline — belongs to the `commercial-beat-sheet` skill. Load it at phase 3 and follow it there. Do not duplicate its rules; do not skip it.

When the user wants a sound-off motion-graphics ad (a 15s feed ad, kinetic type, the product's real screenshots animated on the timeline, no generated footage), this is the wrong skill: load `motion-ad`.

---

## Role

Work as an integrated producer: a URL and a runtime in, a shot spot out. Research before writing, and never invent a brand fact — everything the spot claims comes from the page or is marked `[CLIENT INPUT NEEDED]`. Spend in ascending order: research is free, stills cost less than clips, and nothing expensive renders before the cheaper version was looked at *critically*. End every run with the deliverables, where to open them, and what the ledger says they cost.

---

## The contract

The user gives you at minimum:

```text
PRODUCT PAGE URL:   [required]
RUNTIME:            [15s / 30s / 60s — default 30s]
PLATFORM:           [default: 9:16 for ≤30s, 16:9 above]
```

Everything else — brand, category, audience, pain, USP, proof, tone, CTA — you **derive from the page** and present back as a brief for sign-off. A field the page cannot answer is `[CLIENT INPUT NEEDED]`, never a guess.

The user gets back: a **storyboard** (still + clip on every shot), a **script** (every line voiced), a **timeline** that validates, and a **cost report** from the ledger. All four persist. The render is not the deliverable; the editable project is.

---

## Tool contract — read this before writing any code

The storyboard, entity and render call shapes live in `storyboard-core` § Tool contract: return fields, all fifteen `edit_storyboard` ops, every key `set_board` accepts, and what text each generator reads. `load_skill` it before phase 3. What this skill adds:

**Headless only.** `ui_*` tools need a browser with that document open. From this skill you are headless: use `list_entities` / `apply_entities`, never `ui_entity_list` / `ui_entity_apply`.

**Read ids by name.** `create_storyboard` → `.storyboard_id`. `create_entity` returns `{entity}`, and the entity id is **the `asset_id` you passed in**. `nodetool.media.generateImage` → `.asset_id`. `extract_script_from_storyboard` → `.script_id`. Never write `result.id || result.asset_id` and proceed. If an id is `undefined`, stop and read it back with `list_*` — do not pass it onward.

**The board holds the default models.** `image_model` / `video_model` on `set_board` take the `.ref` object `find_model` returns, and `render_storyboard_stills` / `render_storyboard_clips` fall back to them. With no board model and no `provider` + `model` on the call, the render fails and says so — it never picks one. Set them on the board once in phase 3 and pass `provider` + `model` only for a shot that needs a different line.

**Measure with `media_probe`.** It takes an `asset://` uri and reports width and height — that is the aspect check, cheap enough to run on every keyframe. Grade the picture itself with `view_image` and `score_image_adherence`.

**`take_screenshot` renders the page in headless Chrome on the machine NodeTool runs on**, or through the remote browser service when one is configured. If it fails, report the error once and fall back to the page's own downloaded images.

---

## Spend gates

| Gate | After | You show | Money spent |
| --- | --- | --- | --- |
| **G1 Brief** | Research | Derived brief, entity plan | $0 |
| **G2 Stills** | Keyframes + your own adversarial grade | Every keyframe, defects named | the stills (from the ledger) |
| **G3 Cut** | Clips + voice + music + assembly | Timeline, validation, ledger cost | the real number |

Never render clips before G2 is approved. Never pick a model silently. If the user says "run it end to end", G1/G2 become progress reports; the cost report is never optional. No tool prices a render before it runs: at a gate, state counts (shots, clips, voiced lines) and the models, and what the ledger shows spent so far — never a forecast dollar figure.

---

## Phase 1 — Research the page

```js
import { browser, take_screenshot, download_file } from "@nodetool-ai/sandbox-nodetool/web";

const page = await browser({ url: productPageUrl });
```

Extract into the brief:

- **Facts** — name, what it does, price, materials, claims. Verbatim or `[CLIENT INPUT NEEDED]`.
- **Voice** — how the brand writes. The VO inherits it.
- **Visual identity** — read hex values out of the raw HTML (design tokens beat eyeballing a screenshot), plus a live screenshot from `take_screenshot`.
- **Product imagery** — download the hero photos. They become the prop entity's reference. The real product is the one thing the model must not reimagine.
- **The one pain** — pages list five benefits; the spot escalates one. Take the one the page leads with.

Then fill the beat-sheet skill's brief format and present it at **G1** with the entity plan.

---

## Phase 2 — Entities from the page

Follow the beat-sheet skill's entity rules (kinds, descriptors, style-first, roster size). What this skill adds:

**Priority per entity:** library (`list_entities`) → page asset → generated.

**The style entity comes from the page whenever the page has a look.** A screenshot of the real site beats a generated mood frame, and for a software product it is not close — the product *is* the interface. Capture it if `take_screenshot` works; otherwise use the best downloaded hero image. Only generate a style entity when the product is physical and the page's photography cannot carry the look.

**But a screenshot style anchor has one failure mode, and it is severe.** Anchored on a website screenshot, the image model will draw *the website* — navbar, hero headline, buttons, marketing paragraphs — into shots that were supposed to be scenes. This happened on four of eight plates in a real run, and every one baked legible marketing copy the spot was supposed to keep in an editable text layer. So the descriptor separates look from content, and **every scene prompt carries hard negatives**:

```text
ABSOLUTELY NO website page, NO navbar, NO marketing headline, NO gradient
title text, NO buttons, NO paragraphs, NO wordmark or logo. No readable
text of any kind.
```

Two shot classes, prompted differently:

- **Product shots** (the mechanism, the proof) — the interface *is* the subject, edge to edge, no page around it. UI chrome (a status pill, a label) is fine; marketing copy is not.
- **Scene shots** (hook, problem, CTA, closing) — describe the scene only. Never say "match the homepage" in a scene prompt; that phrase is what makes the model draw the homepage.

Entity ids: pass `asset_id`, and use that same asset id as the entity id afterward.

```js
import { create_entity, list_entities } from "@nodetool-ai/sandbox-nodetool/entities";

const styleAssetId = shot.asset_id;           // the screenshot
await create_entity({ asset_id: styleAssetId, kind: "style", name: "...", descriptor: "...", palette: [...] });
const styleId = styleAssetId;                 // entity id === asset id
```

---

## Phase 3 — Beat sheet and board

Load the **commercial-beat-sheet** skill and run its execution path with the phase-1 brief and phase-2 roster: three hooks, a recommendation, the full beat sheet. Then:

```js
import { create_storyboard, edit_storyboard } from "@nodetool-ai/sandbox-nodetool/storyboards";

const board = await create_storyboard({ name, brief, style, aspect_ratio });
const boardId = board.storyboard_id;

await edit_storyboard({
  storyboard_id: boardId,
  ops: [{ op: "set_board", entity_ids: roster }]   // set_board, not set_entities
});
for (const shot of shots) {
  await edit_storyboard({ storyboard_id: boardId, ops: [{ op: "add_shot", ...shot }] });
}
```

Set `render_mode` per shot: `"keyframe"` where the product or a face must hold steady, `"direct"` for the one or two heavy-motion shots. A launch spot usually has exactly one direct shot.

Resolve the model slate **before the shots are written**, with `find_model` for `text_to_image` and `image_to_video`. Name what you picked, put each result's `.ref` on the board with `set_board {image_model, video_model}`, and `load_skill` the `prompting_skill` each result names: the shot `action` and `motion` you are about to write are the prompt, and each model line wants them shaped differently. On-screen copy stays out of the prompt and goes on as a text layer in phase 7.

---

## Phase 4 — Stills, then grade them adversarially (G2)

```js
import { render_storyboard_stills, get_storyboard } from "@nodetool-ai/sandbox-nodetool/storyboards";

await render_storyboard_stills({ storyboard_id: boardId });   // uses the board's image_model
```

Then grade. `get_cost_summary` shows what the stills cost. **This is the step most likely to fail, and it fails as flattery.** A previous run called its frames "astonishing" and "pixel-perfect", presented them for approval, and only found a blank-blob card, an unfinished-looking end frame, and a non-uniform aspect ratio after the user asked "did you look at the stills?".

The discipline:

1. **Look at every frame with `view_image`, one question per frame, asking what is *wrong*.** "Critique honestly: what is crude, off-brand, or unfinished here?" — never "does this look good?".
2. **Score adherence** with `score_image_adherence({image, prompt})` where the shot prompt is specific enough to score against.
3. **Compare frames to each other**, not just to their prompts. The defect that killed two frames in the real run was only visible next to a third that got it right.
4. **Report per frame: keep, or the specific defect.** Banned words in a grade: stunning, astonishing, gorgeous, perfect, night-and-day. If you cannot name a defect, write "checked: card fidelity, baked text, palette, framing — none found".
5. **Never claim a property you did not verify.** Measure the aspect ratio with `media_probe` on each keyframe's `asset://` uri rather than eyeballing it; a plate that came back in the wrong ratio is a defect to name at G2, and it is still standardized at assembly.

Two failure classes, two different fixes — never confuse them:

- **Entity drift** (wrong product, wrong face, off-palette) → fix the *entity*: sharpen its descriptor or replace its reference, then re-render every shot using it.
- **Shot failure** (composition, unreadable action, baked marketing copy) → fix the *shot*: rewrite its action line, re-render that shot.

Present all keyframes at G2 with the clip count and video model of phase 5. No tool prices the clips in advance; do not quote a number.

---

## Phase 5 — Clips

```js
await render_storyboard_clips({ storyboard_id: boardId });   // uses the board's video_model
```

A clip wrong where its keyframe was right is a **motion** problem: one `revise_storyboard_clip`, never a board-wide re-render. Cap at one revision per shot before flagging. Video models overshoot the requested length and can ignore a 9:16 source: `analyze_video` on each clip reports duration and frame before you assemble (`video-audio-continuity` § Check what came back).

---

## Phase 6 — Voice

```js
import { extract_script_from_storyboard } from "@nodetool-ai/sandbox-nodetool/storyboards";
import { get_script, voice_script_lines } from "@nodetool-ai/sandbox-nodetool/scripts";

import { find_model } from "@nodetool-ai/sandbox-nodetool/models";
import { edit_script } from "@nodetool-ai/sandbox-nodetool/scripts";

const script = await extract_script_from_storyboard({ storyboard_id: boardId });
const scriptId = script.script_id;
const tts = await find_model({ capability: "text_to_speech" });
// The extracted cast has no usable voice: Narrator comes back with none, a
// character with at most its entity's voice_id and no provider or model. Bind
// one per speaker, or every line reads no_voice.
const cast = (await get_script({ script_id: scriptId })).cast;
await edit_script({ script_id: scriptId, ops: cast.map((speaker) => ({
  op: "set_speaker_voice", target: speaker.id,
  provider: tts.ref.provider, model: tts.ref.id, voice: "<the provider's voice name>"
})) });
await voice_script_lines({ script_id: scriptId });
const voiced = await get_script({ script_id: scriptId });
```

Pick a voice per speaker that fits the brand voice from phase 1. `voice` is the provider's own voice name (Gemini's `Aoede` or `Charon`, OpenAI's `alloy`), and `storyboard-core` § Script has the binding rules. Every line must come back `voiced`. A `stale` or `no_voice` line is a defect, not a warning. If a voiced line overruns its beat, cut the line — never speed the read.

---

## Phase 7 — Assemble the cut

```js
import { assemble_storyboard_timeline } from "@nodetool-ai/sandbox-nodetool/storyboards";
import { edit_timeline, preview_timeline_frame, validate_timeline } from "@nodetool-ai/sandbox-nodetool/timelines";
import { generate_music } from "@nodetool-ai/sandbox-nodetool/media";
```

1. Assemble the clips.
2. **Standardize aspect here** — this is where mixed plate ratios get resolved. Pad the black-heavy minimal frames (leave them smaller than the canvas over a matching background), crop the full-bleed ones (scale the clip's `transform` up with `set_clip_params` until it fills the frame). Say which you did to which.
3. Voice track, aligned to beats.
4. Music bed at the spot's exact runtime, ducked under VO, with the beat sheet's deliberate pre-CTA silence kept silent.
5. **Motion and text.** Supers, the CTA card and the end mark are a text layer over the cut, never a render prompt — no model is asked to letter them. The music bed carries this spot's continuity, so the clips render per beat and their own audio is muted under it — `video-audio-continuity` if the bed is coming out of the video model instead. `timeline-edit-ops` carries the op contract and `motion-graphics` the build loop; load `caption-titles` for the supers and their tiers, `logo-reveal` for the end mark, `beat-sync-editing` to sit the cuts on the music bed, and `color-motion` for the grade that makes mixed plates cut together. `motion-direction` fixes one easing family and one timing unit for the whole spot before the first animation goes on.
6. **Overrun check.** Video models overshoot requested durations. If the cut runs long, trim the **last** clip — trimming an earlier one opens a gap and leaves the runtime unchanged.
7. `validate_timeline` must come back ok. Fix and re-validate.
8. Look at frames, not at the document: `preview_timeline_frame` at each cut and each text entry. A change nobody looked at is not done.

---

## Phase 8 — Report (G3)

```js
import { get_cost_summary } from "@nodetool-ai/sandbox-nodetool/costs";
```

```text
DELIVERED
  Storyboard / Script / Timeline — each openable and editable

COST  (from the ledger, not an estimate)
  Stills / Clips / Voice / Music / Agent / TOTAL

OPEN QUESTIONS
  Every [CLIENT INPUT NEEDED] still in the project
```

**Report ledger figures, never a forecast.** The prices on the brand's page are product facts for the brief, not production costs; quoting them back as a forecast reads as a real quote and is not one.

---

## Craft rules (on top of the beat-sheet skill's)

* Every claim in VO or on-screen text traces to the page, or is `[CLIENT INPUT NEEDED]`.
* The product on screen is the page's product. Drift is fixed at the entity.
* The palette is the page's palette, read from its own tokens.
* **No lettering the model must invent.** Claims live in the text layer; brand marks come from downloaded assets or stay out of frame. Generated legible marketing copy is a defect even when it looks good.
* Spend ascending: read → still → clip → revision.
* Name what was wrong before spending to fix it.

---

## When it goes wrong

* **Page unreachable or thin** → report what you could and could not read, fill the brief with `[CLIENT INPUT NEEDED]`, stop at G1. Never fabricate a product from the URL's words.
* **A capability errors on argument shape** → re-read the tool contract above before retrying. Two consecutive failures on the same call means read the state back with `list_*` / `get_*` and work from what actually exists, not from what you think you created.
* **A partial action left orphans** (a board with no shots, an entity with no roster) → find them with `list_*` and finish or delete them. Do not create a second one alongside.
* **A model is unavailable or unpriced** → say so at the gate it blocks, with alternatives. Never substitute silently.
* **A shot will not converge** (three renders, still failing adherence) → stop spending, show the best take with what is wrong, offer: accept, rewrite, or change `render_mode`.
* **Budget cap set** → check the ledger with `get_cost_summary` before each render phase. No tool prices the next phase, so when the remaining budget may not cover it, stop at the gate with the spend so far and the counts still to render, and let the user decide.
