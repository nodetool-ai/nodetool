---
name: wan-2-6-prompting
description: Prompt Alibaba's Wan 2.6 across its three modes — text-to-video with a global style line plus timing-bracketed shots, image-to-video that describes only what changes over time, and reference-to-video that tags subjects as @Video1/@Video2/@Video3. Covers multi_shots formatting, the 800-character prompt budget, negative prompts, motion intensity wording, audio input rules and prompt expansion. Use whenever the model id contains wan-2.6 or wan2.6 (alibaba/wan-2.6/text-to-video, /image-to-video, /image-edit, /text-to-image, wan-video/wan-2.6-t2v, wan-video/wan-2.6-i2v, wan-video/wan2.6-i2v-flash) on generate_video, animate_image or a TextToVideo node. Not for Wan 2.5 or 2.7.
---

# Wan 2.6 → three modes, three prompt shapes

Wan 2.6 generates from text, animates a still, or carries subjects from
reference clips into a new scene. Each mode wants a differently shaped prompt.
Getting the shape wrong is the usual reason a clip comes back generic.

Reach it with `find_model` for `text_to_video` or `image_to_video`, then
`generate_video` / `animate_image`. Main prompts are capped at 800 characters,
which is a real constraint on how you spend words.

## Text to video

Two components: a global style line, then shots with timing brackets.

```
A cinematic journey through ancient ruins at sunset. Photoreal, 4K, film grain.

Shot 1 [0-3s] Wide establishing shot of stone pillars with sunlight streaming through.
Shot 2 [3-7s] Camera tracks forward through an archway revealing a hidden chamber.
Shot 3 [7-10s] Close-up of ancient inscriptions as dust particles float in light beams.
```

`multi_shots` is on by default here. Give each shot a timing indicator, a
camera action (push, pull, pan, orbit, track) and its scene elements — subject
position, lighting change, environmental detail. Keep continuity by referencing
the same characters, locations and objects across shots; unrelated shots
produce disjointed results.

Durations are 5, 10 or 15 seconds at 720p or 1080p, in 16:9, 9:16, 1:1, 4:3 or
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
animation — water, clouds, foliage, smoke. `multi_shots` is off by default in
this mode; set it true to use the bracketed shot format.

Images animate better when they are high resolution, have clear depth of field,
carry atmospheric elements, and are uncluttered with a well-defined subject.
Busy compositions with competing elements produce inconsistent motion. Input
images run 360 to 2000 px per side, up to 100 MB.

## Reference to video

One to three reference videos, tagged in the prompt as `@Video1`, `@Video2`,
`@Video3`. The model extracts each clip's primary subject and composites it
into the generated scene. Durations here are 5 or 10 seconds only.

```
@Video1 walks through a futuristic cityscape as holographic displays activate
around them. Cinematic lighting, shallow depth of field.
```

With more than one reference, state the spatial relationship and the
interaction, or the model places subjects from prompt context and it will not
match your intent:

```
Dance battle between @Video1 and @Video2 in an ancient colosseum. @Video3
watches from a throne. Dynamic camera movement, dramatic lighting.
```

Reference clips work best when the subject is well lit, dominant in frame, shot
from multiple angles if available, under 10 seconds, and against an uncluttered
background. Complex backgrounds or several subjects in one clip make extraction
inconsistent.

## Controls

**Negative prompt** — 500 characters. Prioritise the artifacts you actually
see: "low quality, blurry, distorted faces, unnatural movement, text,
watermarks, shaky camera".

**Motion intensity** is a wording choice, not a parameter. Minimal: "subtle
camera drift", "gentle movement". Moderate: "smooth camera track", "flowing
motion". Dramatic: "dynamic sweeping motion", "rapid camera movement".

**Audio input** takes WAV or MP3, 3 to 30 seconds, up to 15 MB. Audio longer
than the video is truncated; audio shorter leaves the rest silent. For
dialogue, put speaker cues in the prompt.

**Prompt expansion** is on by default and runs an LLM over the prompt before
generation. It adds detail without eating the 800-character budget, and it
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
timing format transfers to the other two modes without any asset dependency.
Check the render with `analyze_video`, `detect_video_scenes` and
`understand_video`.

Adapted from fal's Wan 2.6 prompt guide:
https://fal.ai/learn/devs/wan-2-6-prompt-guide-mastering-all-three-generation-modes
