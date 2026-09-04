---
name: veo-3-prompting
description: Prompt Google's Veo 3 video line — the five-element shot/setting/subject/action/dialogue structure, the cinematography vocabulary it reads directly, duration and aspect-ratio tradeoffs, the enhance-prompt and auto-fix preprocessors, and the fixes for visual drift, temporal inconsistency and audio mismatch. Use whenever the model id contains veo3 or veo-3 (fal-ai/veo3.1 and its fast, lite, image-to-video, first-last-frame and reference-to-video routes, fal-ai/veo3/image-to-video, google/veo3.1 on atlascloud, google/veo-3 and google/veo-3.1 on replicate) on generate_video, animate_image or a TextToVideo node.
---

# Veo 3 → a directorial spec, not a description

Veo 3 produces 4 to 8 second clips with synchronized audio: dialogue with
lip-sync, ambient effects, environmental sound. It parses shot types, camera
angles and film terminology accurately, and holds coherence across the frame
sequence. What separates a usable clip from a generic one is writing the prompt
as a spec rather than a narration.

Reach it with `find_model` for `text_to_video` or `image_to_video`, then
`generate_video` / `animate_image`.

The audio is per clip, so a piece cut from several Veo clips restarts its sound
at every join. `video-audio-continuity` decides whether the scenes belong in one
generation or under a track you add yourself.

## Five elements, in order

1. **Shot** — the camera work that frames everything else: medium shot,
   close-up, wide angle, tracking shot.
2. **Setting and atmosphere** — space, time, lighting quality, environment.
3. **Subject** — enough visual detail to render consistently across frames.
4. **Action** — the movement that defines the temporal progression.
5. **Dialogue** (optional) — spoken lines, for anything needing lip-sync.

> A medium shot frames a cartographer in a cluttered Victorian study. Warm
> lamplight illuminates ancient maps spread across a mahogany table. The
> cartographer, wearing round spectacles and a burgundy vest, traces a route
> with his finger. "According to this sea chart, the lost island exists. We
> sail at dawn."

Each element builds on the one before it.

## Parameters

**Duration** decides how much temporal complexity fits. 4 seconds holds a
single action — establishing shots, product showcases. 6 seconds holds a
multi-stage action or brief dialogue. 8 seconds holds extended dialogue or an
atmospheric moment. Longer durations spread attention across more frames, so
per-frame detail density drops.

**Aspect ratio** changes composition, not just framing. 16:9 matches the
training distribution and composes horizontally. 9:16 concentrates the subject
in a narrower horizontal band. 1:1 outpaints — the model extends the scene past
what you described to fill the square, which can surface environment you never
asked for.

**Resolution**: iterate at 720p, deliver at 1080p.

**Audio** is the cost lever. Disabling it cuts the standard model to roughly
half and the fast variant to about two thirds. Disable it only when a custom
soundtrack is going on in post.

## Cinematography vocabulary

The model was trained on professional film content and reads the terms
directly:

- **Movement**: slow dolly forward, gentle pan left, crane shot descending,
  handheld tracking.
- **Shot types**: extreme close-up, Dutch angle, over-the-shoulder,
  establishing wide.
- **Lighting**: golden hour backlighting, harsh overhead fluorescents, dappled
  forest light, volumetric fog rays.

> A slow tracking shot follows a lone figure walking through fog-shrouded ruins
> at twilight. Volumetric light rays pierce through broken archways, creating
> dramatic god rays in the mist.

**Sensory detail feeds the audio.** A prompt that describes neon reflecting in
rain puddles, steam rising from food stalls and a vendor calling out over
distant traffic gives the audio synthesis more to work with than the same scene
described visually only.

**Character consistency comes from distinctive markers.** "A woman in her
thirties with auburn hair pulled back in a loose bun, wearing a charcoal
peacoat and silver-rimmed glasses" holds identity across frames where "a woman"
does not.

## Preprocessors

**Enhance prompt** (on by default) expands a brief prompt with cinematographic
terminology before generation. Leave it on while exploring; turn it off when
you want your wording interpreted exactly as written.

**Auto fix** (on by default) rewrites prompts that trip content policy instead
of rejecting them, trying to keep the intent.

## Errors and fixes

- **Vague specification** — "a person walks in a city" constrains nothing.
  Specify appearance, the character of the city, the time, the walk.
- **Internal contradiction** — "bright sunny day with dramatic moonlight" fights
  itself. Keep the environment consistent.
- **Temporal overloading** — multiple scene transitions inside 8 seconds rarely
  land. Split into discrete prompts.
- **Unused negative prompt** — use it for "no camera shake", "no lens
  distortion", "no text overlays".
- **Ignored seed** — the seed is how a series holds a look. Record the ones
  that worked.
- **Prompt length** — 150 to 300 characters is the working range. Under 100
  returns generic output; over 400 and the model starts prioritising
  unpredictably.

Symptoms map to fixes. Clothing colour shifting or facial features morphing
means the subject needs more distinctive markers. Objects appearing without
logical progression means the prompt is too complex for the duration — cut it
down or shorten the clip. Dialogue out of sync with lips means the audio cue
needs to be explicit: "a vendor loudly calls out 'Fresh fish!' while
gesturing".

## Working method

Refine on the fast variant at 4 seconds and 720p, where a bad idea costs
almost nothing. Move to the standard model, longer durations and 1080p only
once the prompt is doing what you want. Then vary the seed to explore
alternatives inside the same concept.

Check what rendered with `analyze_video`, `detect_video_scenes` and
`understand_video` instead of assuming.

Adapted from fal's Veo 3 prompt guide:
https://fal.ai/learn/devs/veo3-prompt-guide-master-google-video-generation
