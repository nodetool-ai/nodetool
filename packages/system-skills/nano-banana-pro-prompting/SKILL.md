---
name: nano-banana-pro-prompting
description: Prompt Google's Nano Banana Pro image model — the art-director brief it plans against, the lock/change/amount/constraints shape every edit needs, and the patterns for typography, diagrams, product mockups and storyboards. Use whenever the model id contains nano-banana-pro (fal-ai/nano-banana-pro, fal-ai/nano-banana-pro/edit, google/nano-banana-pro/text-to-image, google/nano-banana-pro/edit, google/nano-banana-pro/edit-ultra, google/nano-banana-pro/text-to-image-ultra, kie's nano-banana-pro) on generate_image, edit_image or a TextToImage node. Not for Nano Banana 2 or plain Nano Banana.
---

# Nano Banana Pro → write the brief, not the adjectives

Nano Banana Pro plans a composition before it paints one: it settles the layout
and the lighting, and only then commits to pixels. Two things follow. It can
reason a picture out — a solved equation on a whiteboard, a process diagram in
the right order — and it gets sharper the more it knows about the job, so one
sentence of context beats one more adjective.

Reach it with `find_model` for `text_to_image` or `image_to_image`, then
`generate_image` / `edit_image`. Nothing below is a parameter; it is all prompt
text.

## The generation brief

Eight slots. Fill the ones the shot needs, in this order:

| Slot | What goes in it |
| :--- | :--- |
| Subject | Who or what, in concrete terms |
| Action | What the subject is doing |
| Setting | Place, time of day, the light in the room |
| Style | The finished look, photoreal through flat illustration |
| Composition and camera | Framing, angle, lens behaviour — brief it like a photographer |
| Lighting and colour | How it is lit, and the grade |
| Text | Any words on the image, in quotes |
| Constraints | What stays out of frame ("no hands, no logos, no hotspots") |

A filled brief:

> A matte-black stainless steel insulated water bottle, 750ml, slim cylindrical
> body, brushed metal cap. It stands upright on a wet slate countertop, a few
> condensation droplets sliding down its side, mid-morning, in a quiet kitchen
> by a north-facing window, soft overcast daylight from the left. Photoreal
> high-end commercial product photography. Tight three-quarter hero shot,
> slightly below eye level so the bottle reads tall, 85mm at f/8 so the whole
> product stays sharp while the background falls into soft blur. One large
> softbox left, a subtle reflector right to control falloff; cool desaturated
> grade, clean neutral whites, a faint blue cast in the shadows. The words
> "STAY COLD. 24 HOURS." in small caps along the lower third. No other props,
> no hands, no visible brand logos, no harsh specular hotspots on the metal.

Add a line about who the image is for when you have one. "This is for a
high-end cookbook" sends the planning step toward shallow focus and careful
plating on its own.

## The edit brief

Edits drift the moment you stop describing what stays. Four slots, and the
first one is the whole trick:

- **Lock** — everything that must not move. Face and layout first, then the
  details you would notice missing: a finish, a text line, the droplets, the
  angle.
- **Change** — the single thing you are altering.
- **Amount** — how far to take it.
- **Constraints** — what the edit must not break.

> Lock: the water bottle — matte-black finish, brushed cap, slim cylindrical
> body, the "STAY COLD. 24 HOURS." text, the condensation droplets, its size
> and position in frame, the three-quarter hero angle. Change: swap the
> kitchen-counter background for a flat grey boulder beside a sunlit mountain
> trail. Amount: full environment swap, understated — soft natural daylight,
> not golden hour; shot on location, not composited. Constraints: don't relight
> or recolour the bottle beyond the new ambient light; no new reflections or
> hotspots on the metal; keep the original cool grade; don't touch the cap,
> droplets or text; no hands, people or gear in frame.

**One change per call.** Ten edits in one sentence is how you lose track of
which one broke the image. Re-state the lock list on every pass.

## Rules that keep it from reading as AI

- Adjectives do not render. "Stunning" draws nothing; overcast light and
  chipped paint draw something.
- Pin style words to something concrete. "Cinematic" drifts; "a teal-and-amber
  grade with hard shadows" does not.
- Name the real thing. If the shot needs a boarding pass, the words "boarding
  pass" beat any amount of mood language.
- Wrap on-image text in quotes and call out the typeface and its position. When
  the model keeps dropping a letter, spell the word out.

The contrast is the whole lesson. "A gorgeous hyper-detailed photo of a potter,
masterpiece, cinematic, 8k" gives the model nothing to decide against. "A
ceramicist in her 40s centering wet clay on a spinning wheel in a cluttered
studio, late-afternoon light raking across the workbench, grey slip drying on
her forearms, a row of unglazed bowls on the shelf behind her, eye-level at
50mm with shallow focus, muted earth tones" is a list of decisions the model no
longer has to invent.

## Patterns worth reaching for

- **Typography and posters** — name the print process, the ink colours, the
  exact words in quotes, the type class and its position: "risograph gig
  poster, two-colour overprinted teal and burnt orange, visible halftone,
  'BLUE ROOM SESSIONS' large in a condensed slab serif across the top,
  'Thursdays, 9pm' in small monospace at the bottom, slightly misregistered".
- **Infographics and diagrams** — this is where the planning step pays. Ask for
  a labelled cross-section or a bar comparison, name the palette and the type
  class, and end with "keep every label legible".
- **Directing the shot** — one hard light source, named falloff, a named lens:
  "lit by one hard source from a window at camera left, deep falloff into
  shadow, a thin rim along the fruit's edge, macro so the waxy skin reads".
- **Wireframe to screen (edit)** — "use the attached pencil wireframe as the
  exact layout"; then the palette, the type class and the copy.
- **Storyboards** — ask for N panels in one image, name the medium ("loose
  black-and-white marker sketches") and vary the framing across the panels.
- **Object swap (edit)** — swap the object, then list the scene, the light, the
  depth of field, the palette and the existing shadows as unchanged, and ask
  for matched scale, texture and contact shadows.

## What the model brings

Resemblance holds for up to 5 people across generations and edits, so recurring
characters in a campaign or a storyboard are workable. Up to 14 reference
images combine in one generation for style or a multi-image scene. Text-to-image
and edit are the same model. Outputs carry SynthID watermarking.

Grade the result rather than eyeballing it: `critique_image` for a written
read, `score_image_adherence` when you need the prompt checked against the
render.

Adapted from fal's Nano Banana Pro prompting guide:
https://fal.ai/learn/tools/nano-banana-pro-prompting-guide
