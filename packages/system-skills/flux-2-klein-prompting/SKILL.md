---
name: flux-2-klein-prompting
description: Prompt Black Forest Labs' FLUX.2 [klein] — the subject/environment/style/technical hierarchy it processes in order, guidance-scale and step choices, negative prompts aimed at real failure modes, and the seed-locked one-variable-at-a-time loop its distilled checkpoints make fast enough to run. Which dials exist depends on base versus distilled. Use whenever the model id contains flux-2/klein or flux-2-klein (fal-ai/flux-2/klein/4b, fal-ai/flux-2/klein/9b, their /base, /edit and /lora variants, fal-ai/flux-2/klein/realtime, black-forest-labs/flux-2-klein-4b, black-forest-labs/flux-2-klein-9b) on generate_image, edit_image or a TextToImage node. Not for FLUX.2 pro, flex, max or dev.
---

# FLUX.2 [klein] → structure first, then iterate fast

klein is the small, fast member of the FLUX.2 family, at 4B or 9B. It ships
two kinds of checkpoint. The distilled ones (every route without `/base`) run
in 4 to 8 steps, which fal's guide puts under a second. The `/base` ones run
28 steps by default and carry the guidance, negative-prompt and acceleration
dials. The speed is the point of the distilled routes. When a generation takes
30 seconds, prompt refinement stalls; here you can change one clause and look
again, so the working method below is worth more than any single prompt.

Reach it with `find_model` for `text_to_image` or `image_to_image`, then
`generate_image` / `edit_image`. `generate_image` forwards only the prompt, a
negative prompt, the size and a quality string, and `edit_image` only the
images, the prompt, a negative prompt, a target size and a strength. Every other
field below exists only on the route's own node: find it with `search_nodes`,
read its fields with `get_node_info`, and run it with `run_node`. Each run is a
paid generation, so confirm the scope with the user before a long loop.

## Prompt hierarchy

klein reads a prompt in this order, and content words (nouns) move the output
more than modifiers do. Write it in the same order:

1. **Subject** — concrete beats abstract. "A woman in her mid-30s with
   shoulder-length auburn hair" over "a person".
2. **Environment** — lighting, atmosphere, spatial relationships. "First light
   filtering through morning mist" gives rendering cues that "morning scene"
   does not.
3. **Style and mood** — direction that guides without overwhelming:
   "documentary photography", "studio lighting", "cinematic".
4. **Technical** — composition ("rule of thirds"), depth of field ("shallow
   focus on the foreground"), palette ("warm earth tones").

> Professional headshot of a male architect in his 40s, salt-and-pepper beard,
> black-rimmed glasses, charcoal blazer. Modern office background with
> architectural models visible but softly blurred. Natural window light from
> the left creating gentle shadows. Corporate photography style, sharp focus on
> the eyes, neutral grey backdrop.

## Parameters

| Parameter | Where it exists | What it trades | Where to sit |
| :--- | :--- | :--- | :--- |
| `guidance_scale` | fal `/base` routes (default 5); Replicate `-base` calls it `guidance` (default 4) | Prompt adherence against creative freedom | 2–4 for artistic interpretation, 5–8 for product photography and technical illustration |
| `num_inference_steps` | fal only: 4–50 on `/base` (default 28), 4–8 on distilled (default 4), 1–8 on `realtime` | Quality against time | Low while developing a prompt, high for print-ready output |
| `acceleration` | fal `/base` routes | Detail against throughput | `regular` for production, `high` for maximum speed |
| `negative_prompt` | fal `/base` routes | See below | Failure modes only |
| `seed` | every route | Nothing — it removes noise from the comparison | Pin it while testing prompt variations |

On a distilled route the prompt and the seed are the whole instrument, and a
negative prompt sent through `generate_image` is dropped.

Aspect ratio follows the deployment: landscape for presentations and web,
portrait for social and mobile, square for profiles and balanced compositions.

## Technique

- **Emphasis is natural language, not weights.** fal's guide says there is no
  weight syntax. "Prominently featuring", "with particular attention to" and
  "especially detailed" are how you raise an element's priority.
- **Negative prompts target failure modes, not quality** (`/base` only). For
  portraits: "distorted features, unnatural proportions, extra limbs". For
  landscapes:
  "oversaturated colours, artificial lighting, lens distortion". A generic
  quality list buys nothing.
- **Text renders well when specified.** Give the copy, the font class, the
  colour, the placement and the capitalisation: "a white coffee mug with the
  text 'GOOD MORNING' in bold sans-serif black letters, centred on the mug".
  Copy that belongs to the design, in other words — a title or a super on a
  still headed for a timeline goes on as a text clip afterwards
  (`caption-titles`), not into the render.
- **Multi-reference conditioning is the family's edge.** "The subject from the
  first image wearing the jacket from the second image, photographed in the
  environment from the third image."

## The five mistakes

- **Overloaded prompts.** fal's guide says that past roughly 100 words the
  model starts dropping clauses. Every word should be doing something.
- **Vague style references.** "Make it look good" is not a direction. "Shot on
  Hasselblad medium format" or "impressionist painting technique" is.
- **Missing composition.** Prompts describe the subject thoroughly and never
  say where it sits. Add "centred composition", "rule of thirds with the
  subject on the left vertical", or "bird's eye view".
- **Conflicting instructions.** "Photorealistic portrait" and "watercolour
  painting style" in one prompt commits to neither.
- **Neglected lighting.** Lighting is what makes an image dimensional. Always
  name it: golden hour, studio softbox, rim lighting creating a silhouette.

## The loop klein is for

Start with subject, environment and style. Generate. Pin the seed. Change one
element — add lighting detail, refine the subject, move the composition — and
generate again. One variable at a time is what tells you which clause drove
which change; a distilled route's turnaround is what makes that affordable.

Keep the prompts that worked. A library of formulas per use case, with the
guidance and step values that suited each, is the output of this loop as much
as the images are.

Adapted from fal's FLUX.2 [klein] prompt guide:
https://fal.ai/learn/devs/flux-2-klein-prompt-guide
