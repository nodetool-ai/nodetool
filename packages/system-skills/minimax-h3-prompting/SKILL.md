---
name: minimax-h3-prompting
description: Prompt MiniMax H3 — choosing between its text-to-video, first-and-last-frame and reference-to-video endpoints, assigning an explicit job to every reference image, clip and audio file, writing a timecoded shot list inside the prompt, art-directing the native stereo audio, and naming a change and its constraint together when editing a clip. Use whenever the model id starts with minimax/h3 (minimax/h3/text-to-video, minimax/h3/image-to-video, minimax/h3/reference-to-video, their /lora variants, minimax/h3-max/* and minimax/h3-max-turbo/*) on generate_video, animate_image or a TextToVideo node. Not for MiniMax Hailuo.
---

# MiniMax H3 → one context, many references

H3 is a general-purpose multimodal video model rather than a set of task
models. Text, images, video and audio all enter one context, so a single
request can carry a character's identity from a photo, camera language and
cutting rhythm from a clip, and a voice from a recording, and resolve them into
one shot with native stereo audio. Output runs 5 to 15 seconds at 24 fps in 2K,
and prompts run up to 7,000 characters — a full shot list with sound design
fits in one request.

Reach it with `find_model` for `text_to_video` or `image_to_video`, then
`generate_video` / `animate_image`.

## Which endpoint

The rule is mechanical:

- **No media in the request** → text to video. Best for anything you can fully
  describe, and for letting the model invent the look rather than match one.
  Distinct hand-drawn styles carry surprisingly far on prompt alone.
- **An image that is literally the first or last frame** → first and last
  frame. One image for the opening, or two for opening and closing, with H3
  generating the motion between. This is the one for animating a static poster,
  a UI mockup or key art. Output follows the uploaded image's aspect ratio.
- **Anything you are treating as a reference** → reference to video. Up to 9
  images, 3 video clips of 2 to 15 seconds, and 3 audio clips, 12 files
  maximum. Identity locking, motion and camera transfer, style matching, voice
  cloning, and editing an existing clip all live here. Default to it whenever
  you have an asset in hand.

## The eight techniques

**1. Assign a job to every reference.** This is the one habit that changes the
most. "Use Image 1 for the overall mood, location and film texture; Image 2 for the
talent; Image 3 for the bag; and Image 4 for the closing brand mark" beats four
images and a description. It works across modalities too: "Match the camera
move in Video 1. Make the subject in Video 2 sing, using Video 3 as the
reference for both the vocal performance and physical delivery."

**2. Write a timed shot list for anything past one beat.** Timecoded blocks
hold the pacing: "[0 to 2 seconds] High-angle overhead shot… [2 to 4 seconds]
Smoothly push in to her right arm… [10 to 15 seconds] As she stands, the full
world loads around her." Without them a 15-second generation drifts into a
slideshow.

**3. Direct the audio.** It is generated natively, so art-direct it like a
shot: "a deep sub-bass pulse, distant metallic resonance, and one restrained
hit as the title locks into focus", or "ice tapping crystal, a faint cigar
burn, subtle room air, clothing movement, controlled breathing". For music,
describe instrumentation and structure over time, including where the beat
lands.

**4. State what you do not want.** Negative direction is unusually effective
and rewards being specific. "No soft dissolves or fluid morphs." "Do not
introduce garbled characters or misspellings." "No tearing, black frames,
obvious VFX, or compositing seams." These keep a stylized prompt from sliding
into a neighbouring genre.

**5. Lock identity by listing the details.** "Preserve the half-up long black
hair, openwork silver crown, indigo ribbon, layered pale hanfu, translucent
blue outer robe, deep-blue sash, silver floral fastener, and long tassels."
Naming features gives the model something to hold. The same works for products,
sets and typography.

**6. For edits, name the change and the constraint together.** Write
substitutions as a list: "Replace the newspaper with a green hardcover book;
replace the chair with a red sofa; remove the subject's sunglasses and reveal a
clear face." Pair each change with what must stay stable and you get a
localized edit instead of a regenerated shot.

**7. Use camera and film language.** Lens choice, movement, exposure behaviour
and stock character all translate: "subtle handheld shake, then push in quickly
and rack focus", "wide angle with strong perspective distortion", "fine grain,
soft highlight halation, restrained colour", "backlit exposure breathing,
slightly coarse noise in the shadows".

**8. Describe transitions as events, not names.** "Fast binocular-scan
transitions with whip movement, motion blur, optical smearing, and brief
exposure flicker. Cut at peak blur, then settle and snap back into focus."
Circular vinyl-record wipes, vertical car-door cuts and oversized letter masks
all land better described than labelled.

## What it is unusually good at

Reading many references at once, rendering legible text and interfaces, and
making precise localized edits to video you already have. That combination
covers brand films and trailers, title sequences and motion-graphics collage,
vertical short drama, product and e-commerce spots, game and web UI motion,
character and motion transfer, voice cloning, and green-screen replacement — all
from the same model.

Two shapes worth stealing. For a title sequence: name the design language, the
transition vocabulary, the credit typography rules ("each role and each name
appears once"), and a timed BGM brief. For a fashion or product film: assign
mood, talent, product and brand mark to separate images, then keep the story
simple and let the references carry the look.

Check the render with `analyze_video`, `detect_video_scenes` and
`understand_video`; `analyze_audio` for the mix you directed.

Adapted from fal's MiniMax H3 prompting guide:
https://fal.ai/learn/devs/minimax-h3-prompting-guide
