---
title: FLUX.2 by Black Forest Labs on NodeTool
description: FLUX.2 is Black Forest Labs’ open‑weight text‑to‑image model with 4MP output, photoreal detail, and reliable text. Runs in NodeTool.
---

## Blurb
FLUX.2 is Black Forest Labs’ flagship open-weight text-to-image model and the successor to FLUX.1. It delivers photoreal detail, reliable text rendering inside images, strong prompt adherence, and 4MP output—ideal for product shots, poster art with legible headlines, and editorial hero images. In NodeTool, you run FLUX.2 through the Text To Image node with any provider listed below.

## Capability facts
- Modality: text-to-image; also supports image-to-image and inpainting
- Notable strengths: photoreal detail; reliable text rendering inside images; strong prompt adherence
- Output: 4MP
- Open-weight; successor to FLUX.1; released 2026
- NodeTool integration: use the Text To Image node with any provider that lists FLUX.2
- Providers:
  - Black Forest Labs — flux-2 — text-to-image
  - fal.ai — fal-ai/flux-2 — text-to-image, image-to-image
  - Replicate — black-forest-labs/flux-2 — text-to-image

## FAQ candidates
- Q: Is FLUX.2 free?
  A: Pricing depends on the provider you use in NodeTool; NodeTool runs FLUX.2 through your keyed provider. Replicate lists it as pay‑per‑image.

- Q: How do I run FLUX.2 in NodeTool?
  A: Add the Text To Image node, pick a provider that offers FLUX.2 (see below), and supply your provider credentials.

- Q: Does FLUX.2 support image-to-image or inpainting?
  A: The model supports both. In NodeTool you invoke it via the Text To Image node through your chosen provider; image‑to‑image and inpainting availability may vary by provider.

- Q: Which providers run FLUX.2 in NodeTool?
  A: Black Forest Labs (flux-2), fal.ai (fal-ai/flux-2), and Replicate (black-forest-labs/flux-2).

- Q: What output resolution does FLUX.2 generate?
  A: 4MP output.

- Q: FLUX.2 vs FLUX.1 — what’s the difference?
  A: FLUX.2 is the successor to FLUX.1 and is positioned as the flagship open-weight text-to-image model by Black Forest Labs; no further comparison details are provided here.

## Reviewer notes
- Inpainting support per provider isn’t specified; only the model’s capability is known, and fal.ai explicitly lists image-to-image.
- Exact 4MP dimensions (e.g., width × height) are not given.
- No pricing beyond “pay‑per‑image” on Replicate and “hosted, fast queue” on fal.ai; avoid implying costs elsewhere.
- NodeTool node usage for image-to-image/inpainting isn’t detailed beyond “Text To Image”; confirm UI guidance if needed.
- Release timing is 2026 per vendor facts; no month/date provided.