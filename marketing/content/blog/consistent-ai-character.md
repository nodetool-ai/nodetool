---
title: "How to keep an AI character consistent in images and video"
description: "Make an AI character that looks the same in every shot: a reference sheet, a fixed descriptor, multi-reference image models and reference-to-video models."
headline: "How to keep an AI character consistent across images and video"
excerpt: "A consistent character comes from two things you fix once and reuse everywhere: a reference image and a descriptor pasted verbatim into every prompt. Here is how to make both, and which image and video models take them."
tag: Guide
date: 2026-10-08
author: "The NodeTool team"
accent: rose
ogImage: screen_storyboard.png
priority: 0.7
changeFrequency: monthly
---

To keep an AI character consistent, fix two things once and send both with every generation: a reference image and a short descriptor of the character's stable traits. Use image models that accept reference images, such as Nano Banana Pro, Seedream 4.5 Edit, FLUX Kontext Multi or Ideogram Character, for stills. Use reference-to-video models, such as Kling O3, Veo 3.1 or Seedance 2.5, for motion. Rewriting the character in each prompt is what makes the face drift.

NodeTool stores the pair as an **entity**: a named image asset with a descriptor that is pasted verbatim into every prompt that uses it, and a reference image that goes along to every model that accepts one. This guide shows how to build a good one and how to carry it through stills, a storyboard and video.

## Quick answer

- **Make the reference first.** Generate a character sheet (front, side, back on one image) before you generate any scene.
- **Write the descriptor as stable traits only.** Face, hair, build. Not the outfit, unless the outfit never changes.
- **Stills:** a multi-reference edit model. Seedream 4.5 Edit and FLUX Kontext Multi are $0.04 per image on [fal](/providers/fal). Nano Banana Pro Edit is $0.15.
- **Video:** reference-to-video. Kling O3 Pro is $0.14 per second on fal and Veo 3.1 is $0.40 per second.
- **A change of state is a new character.** Wet hair, a stained shirt or a second outfit get their own reference and descriptor.

## Why characters drift

A text-to-image model has never seen your character. Each prompt is a new casting call, and "a woman in her thirties with short red hair" matches millions of faces. Three habits make it worse:

1. **Describing the character differently per shot.** "Short red hair" in shot 1 and "auburn bob" in shot 4 are two people to the model.
2. **Putting the outfit in the identity.** When the scene asks for a coat and the descriptor says t-shirt, the model compromises and changes the face too.
3. **Going straight from text to video.** Video models invent a new person per clip. Without a reference image, the same prompt gives you a different actor every time.

The fix is to stop describing the character and start referencing them.

## Step 1: make a reference sheet

A reference sheet is one image with the character from several angles on a plain background. It gives a model more of the face and body than a single portrait does.

In NodeTool, open the **Entities** library and choose **Add entity**. Pick **Character**, give it a name and a descriptor, then choose **Generate with AI** for the reference. A character offers three views: **Full body**, **Portrait** and **Character sheet**. Pick **Character sheet**, choose an image model, and generate a few until one has the face you want.

What to check before you accept one:

- **Same face in every panel.** If the side view is a different person, generate again. Every later shot inherits this image.
- **Neutral lighting and background.** Strong colour light on the sheet colours every later shot.
- **The full figure.** Hands and shoes appear in later shots, so they should appear here.

For a product, the equivalent is a **Prop** entity with a **Turnaround sheet** view. For a place that should be the same street across six cuts, use a **Location** entity with a **Location sheet**.

## Step 2: write the descriptor

The descriptor is the sentence NodeTool pastes verbatim into every prompt that uses the entity. Every generation sees it under a `Consistency references:` heading:

```
Consistency references:
- Mara: a woman in her thirties, pale freckled skin, green eyes, short copper-red hair cut just below the ears, slim build, small silver hoop in the left ear
```

Rules for a descriptor that holds:

- **Stable visual traits only.** Face, skin, eyes, hair, build, permanent marks.
- **No wardrobe** unless the character never changes clothes. Put the outfit in the shot prompt.
- **No mood or action.** "Smiling" or "running" belongs to a shot.
- **Exact words, once.** The same sentence goes into every prompt. Don't reword it later.

## Step 3: generate stills with references

Now each scene prompt only describes the scene: "Mara at a rain-streaked bus stop at night, holding a paper coffee cup, looking down the street." NodeTool adds the descriptor and sends the reference image.

Models that accept reference images for stills:

| Model | Provider | References | USD per image |
| :--- | :--- | :--- | ---: |
| Seedream 4.5 Edit | fal | Several images | 0.04 |
| FLUX Kontext Pro Multi | fal | Several images | 0.04 |
| Ideogram Character | fal | Reference images and masks | 0.05 |
| Nano Banana Pro Edit | fal | Several images | 0.15 |
| GPT Image 2 Edit | fal | Several images | provider rate |

You can also use the generic **Image To Image** node (`nodetool.image.ImageToImage`) and pick any of these. Its extra images are passed as references to providers that support multi-image editing.

In a workflow, the **Apply Entities** node (`nodetool.creative.ApplyEntities`) does the seasoning: it takes your prompt and entities and outputs the finished `prompt` and the `reference_images` to wire into the image node. In chat or in a Prompt node, type `@` and pick the entity, and its descriptor and reference come along.

## Step 4: put the character in a storyboard

For more than a few stills, use a storyboard. Under **Board settings**, the **Entities** field pins a cast to the board. Styles and locations season every shot. Characters and props apply to shots that name them, and each shot's **Edit** view shows the cast as chips you can include or exclude for that shot.

When you render, every keyframe gets the cast's references. Fixing shot 3 never means re-rendering shots 1 to 5, so a face that drifts in one shot is one regeneration, not a new board.

The [Storyboard to Trailer recipe](/recipes/storyboard-to-trailer) shows the casting step with a character, two locations and a prop. The [Viral Video Ad Engine recipe](/recipes/viral-video-ad-engine) attaches a product, a person and a kitchen as reusable entities before any render.

## Step 5: animate with reference-to-video

There are two ways to keep a character in motion.

**Keyframe first.** Render a still with references in Step 3, then animate it with image-to-video. The first frame is your character. After that the model only has that one frame to go on, so a shot where the character turns away and back can return a different face.

**Reference mode.** Send the reference images to a reference-to-video model along with the prompt. The model conditions the whole clip on the references, not just the first frame. NodeTool's storyboard clips have a `reference` render mode that passes every applied entity's reference images to the model.

| Model | Provider | USD |
| :--- | :--- | ---: |
| Vidu Q2 Reference Pro | fal | 0.10 per video |
| Kling O3 Pro Reference | fal | 0.14 per second |
| Veo 3.1 Reference | fal | 0.40 per second |
| Seedance 2.5 Reference | fal | provider rate |

The generic **Reference To Video** node (`nodetool.video.ReferenceToVideo`) takes an ordered list of image and video references and lets you pick the model. Order matters: put the character first. The [UGC Product Video recipe](/recipes/ugc-product-video) uses Seedance 2.5 with the creator as image 1 and the product as image 2, and the [native-audio testimonial template](/templates/generate-a-native-audio-ugc-testimonial) runs the same node with a voice.

## Step 6: handle changes of state

A character who gets soaked in the rain, changes into a suit or ages ten years is, for the model, a different reference. Make a second entity for each state: "Mara, wet" with its own sheet and a descriptor that adds "hair wet and flattened". Keep the base traits word for word, so the face stays the same and only the change is new.

Logos and printed text on clothing are a special case. Don't describe them in words, which invites the model to invent one. If the shirt has a logo, it should be on the reference sheet, or it should be a prop entity of its own.

## What a consistent character costs

| Job | Plan | Total |
| :--- | :--- | ---: |
| Reference sheet | 4 tries on Nano Banana Pro on fal | $0.60 |
| 12 scene stills | 12 × Seedream 4.5 Edit, plus 4 retries | $0.64 |
| 6 clips of 5 s | Kling O3 Pro reference-to-video, 30 s total | $4.20 |
| **Total** | | **$5.44** |

The reference sheet is the cheapest line and the one that decides whether the rest works. Spend your retries there.

## Checklist

1. Generate a character sheet before any scene.
2. Check the face in every panel of the sheet.
3. Write a descriptor of stable traits only, and never reword it.
4. Describe the scene in the shot prompt, not the character.
5. Use multi-reference image models for stills.
6. Use reference-to-video, with the character as the first reference, for motion.
7. Make a new entity for each change of outfit or state.

## FAQ

### How do I make the same AI character appear in multiple images?

Give every generation the same reference image and the same descriptor. Generate a character sheet once, write one sentence of stable visual traits, and use an image model that accepts reference images, such as Seedream 4.5 Edit or Nano Banana Pro Edit. In NodeTool, saving the pair as a character entity applies both automatically.

### What is a character reference sheet?

One image of the character from several angles, usually front, side and back, on a plain background. It gives the model more of the character's face and body than a single portrait. NodeTool's entity library generates one with the Character sheet view.

### Which AI video model keeps characters most consistent?

Use a reference-to-video model rather than plain text-to-video. Kling O3 Reference, Veo 3.1 Reference, Seedance 2.5 Reference and Vidu Q2 Reference all condition the clip on images you supply. Kling O3 Pro costs $0.14 per second and Veo 3.1 $0.40 per second on fal.

### Can I change my character's outfit and keep the face?

Yes. Keep the outfit out of the base descriptor and put it in the shot prompt. For an outfit that recurs, make a second entity with its own reference image and the same face traits word for word.

### Can I use a real person as a character?

Only with that person's consent, and within the model provider's terms. Reference-driven models can produce convincing likenesses, so get permission in writing and label generated footage where it will be published.

## Read next

- [Storyboard to Trailer recipe](/recipes/storyboard-to-trailer) — Cast a character and places, then render the shots.
- [UGC Product Video recipe](/recipes/ugc-product-video) — Reference-to-video with a creator and a product.
- [Image to video](/tasks/image-to-video) — Every model that animates a still.
- [Seedance vs Kling](/models/seedance-vs-kling) — Two reference-capable video models side by side.
