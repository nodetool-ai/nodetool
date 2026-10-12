---
name: wan-2-6-prompting
description: Prompt Alibaba's Wan 2.6 video — text-to-video with a global style line plus timing-bracketed shots, and image-to-video that describes only what changes over time. Covers the shot-mode switch per provider, the prompt budget, negative prompts, motion intensity wording, audio input and prompt expansion. Use whenever the model id names a Wan 2.6 video route (alibaba/wan-2.6/text-to-video, alibaba/wan-2.6/image-to-video, wan-video/wan-2.6-t2v, wan-video/wan-2.6-i2v, wan-video/wan2.6-i2v-flash) on generate_video, animate_image or a TextToVideo node. Not for Wan 2.5 or 2.7, or the Wan 2.6 image routes.
---

# Wan 2.6 → two modes, two prompt shapes

Wan 2.6 generates from text or animates a still. Each mode wants a differently
shaped prompt. Getting the shape wrong is the usual reason a clip comes back
generic.

Reach it with `find_model` for `text_to_video` or `image_to_video`, then
`generate_video` / `animate_image`. Those forward the prompt (and the image),
a negative prompt (not `animate_image`), the duration, the aspect ratio and
the resolution. The shot-mode switch, prompt expansion and an audio file exist
only on the route's own node: find it with `search_nodes`, read its fields
with `get_node_info`, and run it with `run_node`. Each run is a paid
generation, so confirm the scope with the user before rendering several.

fal's guide caps main prompts at 800 characters. No shipped route states the
limit, but write as if it holds.

## Text to video

Two components: a global style line, then shots with timing brackets.

```
A cinematic journey through ancient ruins at sunset. Photoreal, 4K, film grain.

Shot 1 [0-3s] Wide establishing shot of stone pillars with sunlight streaming through.
Shot 2 [3-7s] Camera tracks forward through an archway revealing a hidden chamber.
Shot 3 [7-10s] Close-up of ancient inscriptions as dust particles float in light beams.
```

The shot mode is a switch, and its name and default differ by provider:
AtlasCloud's `shot_type` defaults to `multi`, and Replicate's `multi_shots`
defaults to false, so set it true there before sending bracketed shots. Give
each shot a timing indicator, a
camera action (push, pull, pan, orbit, track) and its scene elements — subject
position, lighting change, environmental detail. Keep continuity by referencing
the same characters, locations and objects across shots; unrelated shots
produce disjointed results.

AtlasCloud's durations are 5, 10 or 15 seconds, at 720p or 1080p, in 16:9, 9:16, 1:1, 4:3 or
3:4. Write to the ratio you picked: wide establishing shots and horizontal
movement for 16:9, tighter framing and vertical composition for 9:16, centred
subjects for 1:1.

## Image to video

Describe the temporal change, not the image. The model already has the frame;
words spent re-describing it are words not spent on motion.

```
Continue from first frame. Gentle camera push toward the mountain peak as
clouds drift overhead. Light changes from morning to golden hour. Cinematic and
serene movement.
```

Spend the prompt on camera motion, lighting shifts, and environmental
animation — water, clouds, foliage, smoke. The same shot switch applies:
AtlasCloud defaults to `multi`, Replicate to `multi_shots` false. Set single
shot for a plain animated still.

Images animate better when they are high resolution, have clear depth of field,
carry atmospheric elements, and are uncluttered with a well-defined subject.
Busy compositions with competing elements produce inconsistent motion. fal's
guide gives input images 360 to 2000 px per side, up to 100 MB.

## Controls

**Negative prompt** — fal's guide caps it at 500 characters. Prioritise the artifacts you actually
see: "low quality, blurry, distorted faces, unnatural movement, text,
watermarks, shaky camera".

**Motion intensity** is a wording choice, not a parameter. Minimal: "subtle
camera drift", "gentle movement". Moderate: "smooth camera track", "flowing
motion". Dramatic: "dynamic sweeping motion", "rapid camera movement".

**Audio input** (`audio` on the route's node) takes WAV or MP3, 3 to 30
seconds, up to 15 MB, per fal's guide. Audio longer than the video is
truncated; audio shorter leaves the rest silent. For
dialogue, put speaker cues in the prompt.

**Prompt expansion** (`enable_prompt_expansion`) is on by default on every
Wan 2.6 video route and runs an LLM over the prompt before generation. It adds
detail without eating the 800-character budget, and it
works best when you have given it style references, visual descriptors and
precise terminology to expand from.

## Symptoms

| What went wrong | What to change |
| :--- | :--- |
| Incoherent narrative | Break the scene into specific shots with timing brackets |
| Inconsistent subjects | Repeat the character description across every shot |
| Unnatural motion | Name the camera movement explicitly: push, pan, orbit |
| Flat visual quality | Add quality descriptors to the global style line |
| An element ignored | Move it earlier in the shot description |

Iterate one variable at a time, and start in text-to-video — the shot and
timing format transfers to image-to-video without any asset dependency.
Check the render with `analyze_video`, `detect_video_scenes` and
`understand_video`.

Adapted from fal's Wan 2.6 prompt guide:
https://fal.ai/learn/devs/wan-2-6-prompt-guide-mastering-all-three-generation-modes
