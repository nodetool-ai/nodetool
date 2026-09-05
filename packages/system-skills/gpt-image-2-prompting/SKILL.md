---
name: gpt-image-2-prompting
description: Prompt OpenAI's GPT Image 2 — the five-slot Scene/Subject/Details/Use case/Constraints template it responds to, the change-versus-preserve shape for edits, labelled multi-image compositing, and how to get text on an image to render verbatim. Use whenever the model id contains gpt-image-2 (openai/gpt-image-2, openai/gpt-image-2/edit, openai/gpt-image-2/text-to-image, kie's gpt-image-2-text-to-image and gpt-image-2-image-to-image) on generate_image, edit_image or a TextToImage node. Not for GPT Image 1, 1-mini or 1.5.
---

# GPT Image 2 → five slots, in order

The model responds to structure: scene, subject, specific details, intended
artifact, constraints, in that order, with line breaks between sections once
the prompt runs past a short paragraph. Everything else sits on top of that
spine.

Reach it with `find_model` for `text_to_image` or `image_to_image`, then
`generate_image` / `edit_image`.

## The template

```
Scene:
[where this happens, time of day, background, environment]

Subject:
[who or what is the main focus]

Important details:
[materials, clothing, texture, lighting, camera angle, lens feel, composition, mood]

Use case:
[editorial photo / product mockup / poster / UI screen / infographic / concept frame]

Constraints:
[no watermark / no logos / no extra text / preserve face / preserve layout]
```

Five slots, five problems people usually blur together: where the image exists,
what it is about, what must be visible, what kind of finished artifact you
want, and what must not drift. The fifth is where mediocre prompts fail
silently — describe the idea without bounding it and the model gets inventive
in directions you will regret.

Filled in:

```
Scene:
A quiet classical museum gallery in soft afternoon light.

Subject:
A woman in her 30s standing casually in front of a large oil painting.

Important details:
Natural smile, realistic skin texture, beige knit sweater, dark jeans, white
sneakers, eye-level full-body framing, marble floor reflections, warm neutral
colour balance, shallow depth of field, believable indoor ambient light.

Use case:
Editorial lifestyle photograph.

Constraints:
No watermark, no logos, no extra people in the foreground, no heavy retouching.
```

## Rules

1. **Visual facts over vague praise.** Drop stunning, incredible, epic,
   masterpiece, insane detail. Use overcast daylight, brushed aluminium,
   chipped paint, clean kerning, 50mm feel, soft bounce light, worn canvas.
2. **Style tags need visual targets.** "Minimalist brutalist editorial luxury
   premium" is noise. "Cream background, heavy black condensed sans serif,
   asymmetrical type block, one hero object, generous negative space, studio
   tabletop lighting" is a layout.
3. **Say the real thing.** Transit kiosk. Boarding pass. Preserve the face.
   Mood language buries the brief.
4. **Separate change from preserve in edits.** "Change only X", "keep
   everything else the same", and repeat the preserve list on every pass.
5. **Treat text as typography.** Wrap literal copy in quotes or ALL CAPS, mark
   it EXACT TEXT, and specify font class, size, colour and placement. Add "no
   extra words" and "no duplicate text".
6. **One revision per turn.** Small iterative edits beat one giant rewrite.

## Three modes

**Generate from scratch** — the five-slot template above. One clean pass lands
believable mundane realism once the prompt locks the lighting, the camera
behaviour and the environment details.

**Edit one image** — two columns, plus a physical-realism line:

```
Change:
Replace the parked car with a vintage bicycle.

Preserve:
The house, fence, driveway concrete, landscaping, lighting direction, and time
of day, exactly.

Constraints:
Match the bicycle's scale and shadow pattern to the existing scene. No extra
objects, no redesign, no watermark.
```

The preserve list carries the edit. Inventory what must stay — awning, brick
facade, mullions, reflections, sidewalk, every person on it — and the edit
stays in scope.

**Combine multiple images** — label every input by role and reference the
labels in the instruction. The family takes up to 16 reference images.

```
Image 1: base scene to preserve.
Image 2: jacket reference.
Image 3: boots reference.

Dress the person from Image 1 using the jacket from Image 2 and the boots from
Image 3. Preserve the face, body shape, pose, background, lighting, and framing
from Image 1. Fit the garments naturally with realistic folds, drape, occlusion
and contact shadows. No extra accessories.
```

Unlabelled inputs make the model guess which image is content and which is
reference, and it guesses wrong.

## What it is good at

- **Photoreal editorial.** Describe the photograph, not the fantasy: lens,
  framing, time of day, light source, surface wear, an ordinary background
  detail, one believable imperfection.
- **Product.** Material accuracy, lighting consistency, label fidelity. A flat
  inventory of physical objects plus one piece of print that must stay legible
  is the entire recipe.
- **UI and screenshots.** Name the screen type, the hierarchy, the exact copy,
  the state, and the layout logic. "Clean survival HUD along the bottom,
  believable UI spacing" does the layout work; remove those clauses and the HUD
  collapses into noise.
- **Text in image.** Give the copy verbatim, then typography, then layout, then
  "render the text verbatim / no extra words / no duplicate text". For a still
  that will sit on a timeline or seed a video clip, leave the copy off and add
  it as a text clip afterwards (`caption-titles`) so it stays editable.
- **Style transfer.** "Same style" is not enough. Name the parts: chunky pixel
  forms, limited arcade palette, bright glow accents, clean silhouette edges.
- **Drawing to photo.** Say whether the drawing is a suggestion or a contract:
  "preserve the exact layout, horizon line, proportions, river path, mountain
  placement, tree placement, and overall perspective".
- **Character consistency.** First prompt establishes the anchor. Second prompt
  repeats the anchor details verbatim and adds "do not redesign the character".

Transparency works on PNG and WebP output when the background is set
transparent; JPEG silently falls back to opaque.

Check the render rather than assuming it: `critique_image`, or
`score_image_adherence` when the prompt has copy or a layout to hold.

Adapted from fal's GPT Image 2 prompting guide:
https://fal.ai/learn/tools/prompting-gpt-image-2
