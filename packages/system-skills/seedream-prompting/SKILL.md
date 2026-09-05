---
name: seedream-prompting
description: Prompt ByteDance's Seedream 4 and 5 image line — the six-layer brief it reads in order, the word budget past which it starts dropping clauses, quoting in-image copy and placing it, pinning what must not change before an edit, addressing up to ten references by content instead of by index, and the size to iterate at versus the size to deliver. Use whenever the model id names Seedream 4 or 5 (bytedance/seedream/v5/pro/text-to-image, bytedance/seedream/v5/lite/edit, fal-ai/bytedance/seedream/v4.5/edit, fal-ai/bytedance/seedream/v4/text-to-image, bytedance/seedream-v5.0-pro/edit, bytedance/seedream-v4.5, seedream/5-pro-image-to-image, seedream/4.5-text-to-image, bytedance/seedream-4.5) on generate_image, edit_image or a TextToImage node. Not for Seedream 3.
---

# Seedream → a production brief, not a caption

Seedream rewards a brief written the way you would hand one to a retoucher:
what the deliverable is, who is in it, where everything sits, how it is lit,
what it says, and what it looks like. Captions get caption results.

Reach it with `find_model` for `text_to_image` or `image_to_image`, then
`generate_image` / `edit_image`.

## Six layers, in this order

Earlier clauses carry more weight, so the order is part of the instruction.

1. **Format** — the deliverable. "Fashion editorial magazine cover", "packshot
   on plain white", "streaming poster".
2. **Subject** — identity, wardrobe, materials, styling. Concrete beats
   flattering: "a woman in her 40s, close-cropped grey hair, oversized charcoal
   wool coat" over "a stylish woman".
3. **Composition** — where things sit and how the frame is cut. "Subject on the
   left vertical third, product centred at the lower edge, generous headroom".
4. **Lighting** — direction and quality. "Hard key from camera left, deep
   falloff, one bounce card filling the shadow side".
5. **In-image text** — the exact copy, in quotes, with its position.
6. **Style** — the aesthetic anchor. "Editorial photorealism, 85mm, shallow
   focus, muted film grade".

An omitted layer is a decision handed to the model's defaults, and its defaults
are centred, evenly lit and generic.

## Word budget

Aim for 30–100 words on Seedream 4.x. Seedream 5 accepts a much longer brief
and starts scattering attention past roughly 600 English words. Specificity
buys more than length: past the budget the model drops clauses, and which ones
it drops is not yours to choose.

## Text in the image

Put the literal copy in quotation marks and say where it goes. Anything you
describe rather than quote, the model writes for you.

> Fashion editorial cover, 3:4. Masthead "ATRIUM" in tall thin capitals across
> the top edge, one cover line "The Quiet Season" in small italics at the lower
> left. A model in a raw-edged linen coat against a bare plaster wall, three-
> quarter turn, looking off-frame right. Soft north light from the left, long
> shadow across the plaster. Editorial photorealism, medium format, muted
> palette. No other text.

Closing with "no other text" is what stops the model filling the margins with
invented lettering. Quote copy only when it belongs to the deliverable itself;
a keyframe for a timeline or a video clip keeps its titles and supers off the
image and gets them as text clips afterwards (`caption-titles`), where they
stay editable.

## Editing: pin before you change

Reference-guided editing takes up to ten images — send more and only the last
ten are used. The failure mode is not the edit — it is everything you did not mention drifting. State the pins:

> Change only the bottle's label to matte black with "SERIES 04" in white
> sans-serif capitals. Keep the exact bottle silhouette, the exact camera
> angle, the exact backdrop and the exact studio lighting from the reference.

Address references by what they contain, not by position: "the tan leather
journal", not "the second image". Content descriptions survive re-ordering and
disambiguate two references that look alike. For product identity, feed
packshots on white — a lifestyle photo carries a scene the model will try to
keep.

Seedream 5 Pro adds region-precise editing and layer separation, which is what
makes it the pick when one element must change and the rest of the frame must
be provably untouched.

## Size and tiers

`image_size` runs from 1024×1024 to 2048×2048 total pixels, aspect ratios 1:16
to 16:1, and defaults to `auto_2K`. Work the composition at the smaller tier
while you iterate and render the deliverable at 2K. Match the ratio to the
brief rather than defaulting to square: 3:4 for a cover, 9:16 for a poster, 4:3
for a still life.

## Symptoms

| What went wrong | What to change |
| :--- | :--- |
| Subject differs from what you described | Move the subject description earlier and make its defining features concrete |
| An unwanted illustrative style | Name the style you want and negate the one you got explicitly |
| Elements land in the wrong place | State spatial relationships; cut the number of things in the frame |
| Copy is paraphrased or invented | Quote it exactly, place it, and close with "no other text" |
| An untouched region changed in an edit | Add the pins — silhouette, angle, backdrop, lighting |
| Clauses at the end were ignored | You are over budget; cut to the layers that matter |

Grade the result with `critique_image` and `score_image_adherence` rather than
eyeballing it, and `compare_images` when you are choosing between candidates.

Adapted from fal's Seedream v4.5 prompt guide and Runware's Seedream 5.0 Pro
prompting guide:
https://fal.ai/learn/devs/seedream-v4-5-prompt-guide
https://runware.ai/docs/models/bytedance-seedream-5-0-pro/guides/prompting
