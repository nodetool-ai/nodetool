---
name: qwen-image-prompting
description: Prompt Alibaba's Qwen-Image line for the typography work it is built for — quoting exact copy so the model stops inventing it, switching prompt expansion off before it rewrites your strings, describing layout in relative position and weight rather than point sizes, writing non-Latin scripts as characters, and addressing edit references as image 1/2/3. Use whenever the model id names Qwen-Image (alibaba/qwen-image-3/text-to-image, alibaba/qwen-image-3/edit, fal-ai/qwen-image-2/pro/text-to-image, fal-ai/qwen-image-edit-2511, fal-ai/qwen-image-2512, fal-ai/qwen-image-layered, qwen-image-3.0-pro/edit, qwen/qwen-image-edit-plus) on generate_image, edit_image or a TextToImage node.
---

# Qwen-Image → the model you reach for when the image has words in it

Qwen-Image renders text other image models garble: twelve scripts natively,
legible down to roughly 10 px, long layout instructions honoured. That is the
reason to pick it, and the prompt should spend its length on the copy and the
layout rather than on adjectives.

Reach it with `find_model` for `text_to_image` or `image_to_image`, then
`generate_image` / `edit_image`. Prompts run to 5000 characters; the negative
prompt caps at 500.

## Quote the copy

Anything in quotation marks is treated as literal copy. Anything you describe
instead, the model writes for you — usually plausibly and never what you meant.

> A vertical science poster. Title "轨道力学" in large bold characters across the
> upper third, subtitle "Orbital Mechanics" in small widely-spaced capitals
> directly beneath. Three labelled diagram panels down the centre, captions
> "近地点", "远地点", "转移轨道" under each. A thin rule separates the diagram block
> from a footer reading "第三版 · 2026". Flat editorial illustration, two-colour
> palette. No other text.

Three habits that make it land:

- **Write the characters, never describe them.** Paste the Chinese, Japanese,
  Korean or Spanish string itself, with its diacritics. "The Chinese word for
  orbit" produces something that is not that word.
- **State the relationship between scripts** in a bilingual layout — "on the
  same line", "stacked directly beneath" — and match their size and weight, or
  one language reads as an afterthought.
- **Close with "no other text".** Left to itself, the model fills empty margins
  with invented lettering.

This is the model for copy that is part of the image — a poster, a label, a
sign in the scene. A title or a super on a still headed for a timeline is not:
that goes on as a text clip afterwards (`caption-titles`), where it can be
corrected and re-timed.

## Turn prompt expansion off for typography

On the hosted tiers — Qwen-Image-2, Max and 3 — `enable_prompt_expansion`
defaults to true and runs an LLM over your prompt first. It helps a three-word
prompt and ruins a typographic one: it edits the strings you quoted and adds
signage you did not ask for. Set it false whenever exact copy matters.

The open-weight checkpoints (`fal-ai/qwen-image`, the `qwen-image-edit-*`
releases) have no such flag and take your prompt as written. What they expose
instead is `guidance_scale`, `num_inference_steps` and LoRAs — raise guidance
when the layout is being loosely interpreted, and leave the step count alone
until the prompt is settled.

## Layout is relative, not metric

Point sizes and pixel coordinates mean nothing here. Vertical order, relative
size and relative weight mean everything. "Large bold capitals across the top,
small widely-spaced capitals directly beneath, body copy in two columns below
the rule" is a layout the model can execute. "24pt heading at x=120" is not.

For dense label sets, add structural marks — rules, borders, panels. Without
them a block of labels renders as a list.

## Size

On Qwen-Image-3, text-to-image runs 512×512 to 2048×2048 total pixels and
editing runs 512×512 to 1440×1440; the other checkpoints have their own
ceilings, so read the endpoint. Small type needs the pixels: draft the
composition small, then render the deliverable near the ceiling, and choose a
taller canvas when the fine print has to survive.

## Editing

Qwen-Image-3 Edit takes one to three reference images and **order matters** —
the prompt addresses them as "image 1", "image 2", "image 3". References run
384–2048 px per side, 10 MB each, JPEG/PNG without alpha or WEBP. The earlier
edit checkpoints take a list too, and the same "image N" convention applies.

> Place the bottle from image 1 on the marble surface from image 2, keeping the
> bottle's label, proportions and cap exactly as they are. Match the lighting
> direction of image 2. Replace the label copy with "SERIES 04" in white
> sans-serif capitals.

Name what stays as explicitly as what changes. Recolouring a packshot, carrying
a product into a new scene, and staging two products together are all the same
instruction shape: what comes from which image, what must not move.

## Symptoms

| What went wrong | What to change |
| :--- | :--- |
| The text is close to yours but not yours | Quote it, and set `enable_prompt_expansion` false |
| Invented words in the margins | Add "no other text" |
| Non-Latin script renders as garbage | Paste the characters instead of describing them |
| Small type is illegible | Render nearer the pixel ceiling, or use a taller canvas |
| The wrong reference supplied the subject | Say "image 1" / "image 2" explicitly and check the order you sent |
| Hierarchy is flat | Give each line a relative size and weight, not a size in points |

Grade the result with `critique_image` and `score_image_adherence`, which will
tell you whether the copy rendered as written before you look at the picture.

Adapted from Runware's Qwen-Image-3.0 text and typography guide:
https://runware.ai/docs/models/alibaba-qwen-image-3-0/guides/text-and-typography
