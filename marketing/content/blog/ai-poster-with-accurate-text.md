---
title: "How to make an AI poster with accurate text in 2026"
description: "A repeatable poster workflow: Ideogram, GPT Image 2 or Nano Banana Pro for type, masked edits for copy changes, an upscaler for print, and exact sizing."
headline: "How to make an AI poster with accurate text"
excerpt: "Write the prompt as a copy deck, draft on a cheap text-capable model, fix wrong letters with a masked edit instead of a re-roll, and size for print last. Per image, the drafts cost between one and fifteen cents."
tag: Tutorial
date: 2026-10-08
author: "The NodeTool team"
accent: amber
ogImage: poster-singularity-1.png
priority: 0.7
changeFrequency: monthly
---

To make an AI poster with accurate text, use an image model built for typography, such as Ideogram v3, GPT Image 2, Nano Banana Pro, Recraft v4.1 or Qwen Image. Put every word of copy in quotes in the prompt and turn off automatic prompt expansion. Fix any wrong letters with a masked edit instead of generating again. Upscale and size the file for print as the last step. At provider rates a draft costs between $0.009 and $0.15, and a finished A-size poster costs well under a dollar.

A single generation is rarely the deliverable. The headline is right but the date is misspelled. The client changes one line after approval. The printer wants 300 dpi at an exact size. Each of those is a separate step with its own node, and this guide builds them as one graph you can rerun for the next poster.

Prices below come from the provider catalogs NodeTool bills against, read in July and August 2026. You pay them on your own key, at [provider rates](/pricing).

## Quick answer

- **Best value for type:** Ideogram v3 at $0.03 per image on [fal](/providers/fal), with a masked edit endpoint at the same price.
- **Cheapest text-capable draft:** GPT Image 2 on [AtlasCloud](/providers/atlascloud) at $0.009 per image.
- **Hardest layouts and long copy:** Nano Banana Pro (Gemini 3 Pro Image), $0.09 on [kie](/providers/kie) or $0.15 on fal.
- **Fixing one wrong word:** a masked edit with Ideogram v3 Edit, GPT Image 2 Edit or Qwen Image Edit Inpaint. Don't regenerate the whole poster.
- **Print size:** upscale with Topaz or Clarity, then set the exact pixel size with Resize Image and Canvas Resize.

## Why one generation is not enough

Text-capable models are good, but a poster has more characters than a logo and every one has to be right. Three things break a one-shot approach:

1. **Small copy is the risk.** A title is large and short. Credit blocks, dates and URLs are small and long, and that is where wrong letters tend to appear.
2. **Copy changes after approval.** Regenerating to change one line also changes the image, and the approved composition is gone.
3. **Print needs pixels the model does not return.** A4 at 300 dpi is 2,480 by 3,508 pixels, about 8.7 megapixels. Ideogram v3's default size is 1024 by 1024, about one megapixel.

The workflow below handles each in its own step, so a change late in the job costs one edit, not a restart.

## Text-capable image models compared

| Model | Provider | USD per image |
| :--- | :--- | ---: |
| GPT Image 2 | AtlasCloud | 0.009 |
| Ideogram v3 | fal | 0.03 |
| Recraft v4.1 | fal | 0.035 |
| Seedream 4.5 | fal | 0.04 |
| Nano Banana 2 | kie | 0.04 |
| Qwen Image Max | fal | 0.075 |
| Ideogram v3 | Replicate | 0.09 |
| Nano Banana Pro | kie | 0.09 |
| Nano Banana Pro | fal | 0.15 |

Two things stand out.

**The same model costs different amounts on different providers.** Ideogram v3 is three times the price on Replicate that it is on fal. Nano Banana Pro is $0.09 on kie and $0.15 on fal. If you have both keys, you choose the provider per node.

**Newer typography models are also reachable.** fal exposes Ideogram 4.5 (`fal.text_to_image.IdeogramV45`), whose model card describes "accurate text rendering" for posters and logos, which has no list price in our catalog yet, so check the meter after a run. Recraft v4.1 Pro (`fal.text_to_image.RecraftV41ProTextToImage`, $0.21 per image) is described for campaign and print work up to 2048 by 2048.

For a deeper look at two of these, see [GPT Image](/models/gpt-image) and [FLUX vs GPT Image](/models/flux-vs-gpt-image).

## Step 1: write the prompt as a copy deck

Treat the prompt as a brief for a typesetter, not a description of a mood.

- **Quote every string exactly.** `Title: "SINGULARITY"`, `Tagline: "The last human decision."`, `Date line: "IN CINEMAS 14 NOVEMBER"`. Unquoted copy gets paraphrased.
- **Give each string a position and a size.** "Title across the top third, large condensed sans-serif. Credit block in small type at the bottom edge."
- **Say what must not appear.** "No other text. No logos. No watermark." Forbidding extra text in the prompt is cheaper than editing it out afterwards.
- **Fewer strings per pass.** If the poster needs a dense credit block, generate the art and the title first and add the block in Step 5.
- **Turn off prompt expansion.** Ideogram's `expand_prompt` (MagicPrompt) is on by default, and it rewrites your prompt before generation. It improves art and changes copy. Turn it off for posters.

The prompting guides NodeTool's agent ships with for GPT Image 2, Nano Banana Pro, Qwen Image and Seedream give the same advice: quote the exact copy so the model does not invent it.

## Step 2: draft cheap, check every character

Build the first part of the graph:

1. **String Input** for the copy deck.
2. **Text To Image** (`nodetool.image.TextToImage`) with a text-capable model in its picker. Set the aspect ratio to the poster's shape now, usually 2:3 or 3:4. Cropping a finished poster cuts type.
3. **Preview**, then run it four to six times.

Read every word in every draft, including small print. Pick the draft with the best composition, not the one with the fewest typos. Typos are cheap to fix in Step 3. Composition is not.

If you would rather not write the copy deck by hand, the [Movie Posters template](/templates/movie-posters) puts an Agent node in front of the image node. You give it a title and a premise, and it writes a key-art brief with the typography spelled out. The [movie poster use case](/use-cases/movie-poster) shows a run of five posters from one brief.

## Step 3: fix wrong letters with a masked edit

When one word is wrong, edit only that word.

Mask editing nodes take the image, a mask and a prompt. White areas of the mask are regenerated and black areas are kept. Three good choices:

- **Ideogram v3 Edit** (`fal.image_to_image.IdeogramV3Edit`), $0.03 per edit, with a `mask` input.
- **GPT Image 2 Edit** (`fal.image_to_image.GptImage2Edit`), with a `mask` input and reference images.
- **Qwen Image Edit Inpaint** (`fal.image_to_image.QwenImageEditInpaint`).

Draw the mask with the **Painter** node (`nodetool.image.Painter`), which lets you paint a mask on top of the image inside the graph. In a sketch, mark a layer as the document mask and it is exported as a separate mask output for inpainting nodes.

Write the edit prompt as the replacement only: `Text reads exactly "IN CINEMAS 14 NOVEMBER" in the same font, size and colour as the surrounding type.` Keep the mask tight around the line but include the full height of the letters. A mask that clips the descenders produces a new word sitting on half of the old one.

The same step handles late copy changes. Mask the line, write the new string, and the approved artwork stays put. For changes that are not about text, such as a colour or prop, the [Edit a Still with Words](/templates/edit-a-still-with-words) template runs a Nano Banana edit with no mask.

## Step 4: upscale for print

Upscale after the copy is final. Upscaling first means every edit happens on a larger, slower and more expensive image.

| Upscaler | Provider | Price |
| :--- | :--- | ---: |
| Topaz | fal | $0.01 per megapixel |
| Clarity | fal | $0.03 per megapixel |
| AtlasCloud | AtlasCloud | provider rate |
| Recraft Crisp | fal | provider rate |

The generic **Upscale** node (`nodetool.image.Upscale`) has a picker for all of them. Zoom in on the type after upscaling. A creative upscaler can redraw letterforms, which is useful on painted texture and harmful on a credit block. Choose a conservative mode (Topaz, Recraft Crisp) when the poster is mostly type.

The [Generate Then Upscale a Poster](/templates/generate-then-upscale-a-poster) template wires Steps 2 and 4 together. [Take a Product Shot to Print Resolution](/templates/take-a-product-shot-to-print-resolution) adds an unsharp mask after the upscale.

## Step 5: set the exact size and add fixed type

Printers want exact pixel dimensions. Two native nodes get you there without another model call:

- **Resize Image** (`nodetool.image.ResizeImage`) in `fit` or `dimensions` mode scales to the target size.
- **Canvas Resize** (`nodetool.image.CanvasResize`) expands the canvas around the image without scaling, which is how you add bleed.

For type that must be exact every time, such as a legal line, a logo or a sponsor strip, don't generate it. Place it:

- **Paste** (`nodetool.image.Paste`) places a logo PNG at given coordinates.
- **Compositor** (`nodetool.image.Compositor`) stacks several layers with per-layer opacity and blend mode.
- For set type, write it as SVG and rasterize it with **SVG To Image** (`lib.svg.SVGToImage`), then composite it on. The [Gradient Card as PNG](/templates/a-gradient-card-as-png) template shows the SVG-to-PNG step.

## Step 6: save it

Wire the final image into an **Output** node so it is saved as an asset at full resolution, rather than only shown as a preview. If you will make this poster again with different copy, name the String Input and run the graph from the CLI or wrap it in a mini app with one text field and a Run button.

## What a finished poster costs

| Step | Plan | Cost |
| :--- | :--- | ---: |
| Drafts | 6 × Ideogram v3 on fal | $0.18 |
| Copy fixes | 2 masked edits with Ideogram v3 Edit | $0.06 |
| Upscale | Topaz, billed per megapixel | about $0.09 to an A4 300 dpi file |
| Resize, canvas, logo | Native nodes | $0.00 |
| **Total** | | **about $0.33** |

The Topaz line assumes billing on the 8.7-megapixel output. Swap the drafts to Nano Banana Pro on kie and the total is about $0.69.

## Checklist

1. Quote every string, give it a position, and forbid extra text.
2. Turn off automatic prompt expansion.
3. Set the aspect ratio before the first draft.
4. Pick the best composition, then fix typos with masked edits.
5. Keep masks tight but include full letter height.
6. Upscale after the copy is final, with a conservative mode for type.
7. Size with native nodes, and place fixed type and logos instead of generating them.

## FAQ

### Which AI image model is best at text?

Ideogram, GPT Image 2, Nano Banana Pro, Recraft and Qwen Image are all built to render legible text. Ideogram v3 is the best value at $0.03 per image on fal, GPT Image 2 is the cheapest at $0.009 on AtlasCloud, and Nano Banana Pro handles the most complex layouts at a higher price. Run your own copy through two of them and count the errors.

### How do I fix a misspelled word in an AI image?

Use a masked edit. Paint a mask over the wrong word, then send the image, the mask and a prompt with the correct text to an edit model such as Ideogram v3 Edit or GPT Image 2 Edit. Only the masked area changes, so the rest of the poster stays as approved.

### Can AI generate a poster at print resolution?

Not in one step. Image models return far fewer pixels than print needs: Ideogram v3 defaults to about one megapixel, and A4 at 300 dpi needs about 8.7. Generate at the model's native size, upscale once the copy is final, then set exact dimensions and bleed with Resize Image and Canvas Resize.

### Can I change the text later without changing the image?

Yes. Mask only the line you want to change and run a masked edit with the new copy. The rest of the image is kept, which is why the masked edit is the step to reach for after approval, not a new generation.

## Read next

- [Movie poster use case](/use-cases/movie-poster) — Five posters from one brief.
- [Movie Posters template](/templates/movie-posters) — The agent-written key-art brief, ready to run.
- [How much does AI image generation cost in 2026?](/blog/ai-image-generation-cost) — Per-image rates for every model above.
- [Text to image](/tasks/text-to-image) — Every image model you can wire in.
