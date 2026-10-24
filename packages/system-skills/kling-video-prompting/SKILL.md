---
name: kling-video-prompting
description: Prompt Kuaishou's Kling video line from 2.5-turbo onward — which version exposes a shot list, tagged elements, native audio and a CFG dial at all, one shot per entry in multi_prompt rather than one paragraph, characters tagged @Element1/@Element2 so a face survives a cut, the labelled dialogue format native audio lip-syncs to, a negative prompt aimed at the artifacts Kling actually produces, and what motion-control takes instead of a prompt. Use whenever the model id names Kling 2.5-turbo, 2.6, v3, O1 or O3 (fal-ai/kling-video/v3/pro/text-to-video, fal-ai/kling-video/o3/pro/reference-to-video, fal-ai/kling-video/v2.6/pro/image-to-video, kling-3.0-omni/text-to-video, kling-2.6/text-to-video, kwaivgi/kling-v3.0-pro, kwaivgi/kling-video-o3-pro, kwaivgi/kling-o1) on generate_video, animate_image, generate_video_from_references or a TextToVideo node. Not for Kling 1.x, 2.0 or 2.1, and not for Kling Image.
---

# Kling → write shots, not paragraphs

The newer Kling versions take a shot list rather than a prompt: one call
carries several shots, generates native audio with lip sync, and holds a tagged
character across every cut. A single dense paragraph throws all three away and
comes back as one drifting take.

Which of those you get depends on the version and on the provider, so check
the route before you write. On fal:

| Version (fal) | Shot list | Tagged elements | Native audio (`generate_audio`) | cfg_scale / negative prompt |
| :--- | :--- | :--- | :--- | :--- |
| 2.5-turbo | — | — | — | yes |
| 2.6 | — | — | on by default | negative prompt; `cfg_scale` on text-to-video only |
| O1 | — | reference and video-to-video routes | — | — |
| v3 | yes | image-to-video routes | on by default | yes |
| v3 turbo | `multi_prompt` only | — | — | — |
| O3 | yes | reference and video-to-video routes | **off** by default | — |

The other providers name and default the same controls differently:

- **kie** — audio is `sound` (default false) on `kling-2.6/*` and
  `kling-3.0/video`, and `audio` (default false) on `kling-3.0-omni/*`.
  `kling-3.0/video` takes `multi_shots` with up to 12 `multi_prompt` entries
  and up to 3 `kling_elements`. The omni routes take `customize_multi_shots` /
  `prefer_multi_shots`, up to 6 `multi_prompt` entries, and `elements`.
  `kling/v3-turbo-*` takes only a prompt and a duration.
- **AtlasCloud** — audio is `sound`, on by default except on the O3
  reference-to-video routes. There is no `multi_prompt`: the shot switch is
  `multi_shot` with `shot_type` `customize` or `intelligence`. `cfg_scale` and
  `negative_prompt` exist on v2.6 and v3.0, not O3. `kling-v3.0-turbo/*` takes
  only a prompt and a duration.
- **Replicate** — `generate_audio` is off by default on `kling-v3-video` and
  `kling-v3-omni-video`, and on by default on `kling-v2.6`.

Native audio belongs to the call that made it. Several separately generated
clips cut together drop their sound at each join — `video-audio-continuity`
covers the two builds that avoid it.

Reach it with `find_model` for `text_to_video` or `image_to_video`, then
`generate_video` / `animate_image`. The reference-to-video routes take
`generate_video_from_references` with `find_model` for `reference_to_video`;
it sends plain reference images and videos, not tagged elements. Those tools
forward the prompt (and the media), a negative prompt (not `animate_image`),
the duration, the aspect ratio and the resolution. The shot list, `elements`,
`cfg_scale`, the audio switch and an end frame exist only on
the route's own node: find it with `search_nodes`, read its fields with
`get_node_info`, and run it with `run_node`. Each run is a paid generation,
so confirm the scope with the user before rendering several.

Clips run 3–15 seconds on v3 and O3 and 5 or 10 on most 2.x routes, 720p to
4K, in 16:9, 9:16 or 1:1. The prompt caps at 2500 characters on most fal
routes, 3072 on fal's v3 turbo and kie's omni routes, and 1000 on kie's 2.6.

## One shot per prompt

On v3 and O3, `multi_prompt` takes the shots and `prompt` takes a single shot;
they are mutually exclusive, so send one or the other. With fal's `shot_type`
set to `customize` (or kie omni's `customize_multi_shots` true), your shot
boundaries are used verbatim; with `intelligent` (or `prefer_multi_shots`) the
model cuts the narrative itself. Pick customize whenever you know the beats.
The provider list above gives each route's shot fields and caps.

In a graph, build the shot list from Shot nodes: each takes a prompt and a
duration in seconds, and chains to the next through its Previous input. Wire
the last Shot into `multi_prompt`. The node sends the shots instead of the
prompt, turns on customize, and sets the clip duration to the shots' total.

On 2.5-turbo, 2.6 and O1 there is no shot list — one call is one shot, and a
sequence is several calls cut together in the timeline. Writing three labelled
shots into a single `prompt` there gets you one confused take.

Two to five sentences per shot is the working range. Each one names framing,
subject action, and camera behaviour:

```
Shot 1 (4s): Wide. A courier in a wet orange jacket steps off a tram into
  a night market, steam rising off the food stalls. Camera locked off.
Shot 2 (3s): Close on her hands unfolding a paper note, the ink running.
  Slow push-in, shallow focus.
Shot 3 (5s): Medium tracking shot alongside her as she pushes through the
  crowd toward a lit doorway, neon reflections sliding over the jacket.
```

Repeat the subject description in every shot that contains it. A pronoun in
shot 3 is a new person.

## Elements keep a face across the cut

`elements` takes reference images or a reference video per character or object;
the prompt addresses them as `@Element1`, `@Element2`. Which routes carry it is
in the table and provider list above. On the reference-to-video endpoints,
style references come in separately through `images` and are addressed as
`@Image1`. Elements plus reference images cap at four when a video reference is
in play; kie's omni endpoint takes up to seven image subjects, or three video
character subjects.

```
@Element1 sets the espresso cup down on the counter beside @Element2 without
looking up. Medium two-shot, warm window light from the left.
```

Tagging is what gives Kling three or more distinct characters in one clip
without their faces blending. Describe each element once, then refer to it by
tag only.

In a graph, connect one Element node per character to `elements`; connection
order sets the numbering. Give an Element a name and write `@name` in the
prompt: the node rewrites it to `@ElementN` on fal and sends the name itself
on kie.

## Dialogue and native audio

Native audio's switch and default differ per route (the table and provider list
above). On fal an O3 clip comes back silent unless you set `generate_audio`.
It produces dialogue with lip sync, plus ambience. Direct it with a labelled
line:

```
[Detective Voss, low and tired]: "You left the light on."
Immediately, [Marla, brittle, too fast]: "I was coming back."
```

Four rules the format depends on:

- **Labels are unique and constant.** `Detective Voss` in every line, never
  "he" and never "the detective".
- **Bind each line to an action.** Write the action first, then the line. An
  unanchored line drifts off the picture.
- **Sequence with a linking word.** "Immediately", "after a beat", "as she
  turns" — without one, two lines overlap into mush.
- **Case matters for English speech.** fal's guide says to write it lowercase
  and reserve capitals for acronyms and proper nouns, which is how the model
  decides to spell a word out.

fal's guide says Chinese and English are voiced natively and anything else is
translated to English before it is spoken, so write the line in the language
you want heard.

## Controls

| Parameter | Where it exists | What to do with it |
| :--- | :--- | :--- |
| `cfg_scale` | 2.5-turbo, fal 2.6 text-to-video, AtlasCloud 2.6, v3 (not turbo) | 0.5 default; 0.3 for a freer read, 0.7 only when spatial layout is fixed |
| `negative_prompt` | 2.5-turbo, 2.6, v3 (not turbo) | fal's default is "blur, distort, and low quality"; add what you see — sliding feet, extra fingers, warped faces, jittery camera |
| `duration` | every route | 3–15s on v3 and O3; each shot in a multi-shot list gets its own |
| `generate_audio` / `sound` / `audio` | 2.6, v3, O3 (not turbo) | Off costs less per second; leave it off when you are scoring in the timeline anyway |

Negative prompts earn their place here more than on most lines: Kling's
failures are limb and contact artifacts during fast motion, and naming the one
you are actually seeing suppresses it. O1, O3 and v3 turbo expose neither
dial, so on those the prompt is the whole instrument — spend the words the parameters would
have saved.

## Image to video

The image is the anchor. Prompt only the change — camera move, what the subject
does next, how the light shifts. Re-describing what is already in the frame
spends words and invites the model to re-render it slightly differently.
A start image plus an end image (`end_image_url` on fal, `tail_image_url` on
fal's 2.5-turbo, `end_image` on AtlasCloud and Replicate) gives you a move with
a fixed landing frame. `animate_image` sends one image, so an end frame needs
the route's own node. Aspect ratio follows the input image; the parameter is
ignored.

## Motion control is not a prompt job

The motion-control endpoints copy character motion from a reference video onto
a reference image, and the prompt only colours the result. What decides the
output is `character_orientation`: `video` matches the reference clip's
orientation and handles complex motion up to 30 s; `image` matches the still
and follows camera movement better, capped at 10 s. The reference image needs
an unobstructed figure occupying more than 5% of the frame.

## Symptoms

| What went wrong | What to change |
| :--- | :--- |
| One drifting take instead of beats | Move the shots into the route's shot list with customize set, or move to v3/O3 if your version has no shot list |
| A clip came back silent | That route's audio switch defaults to false — check the provider list |
| A character changes face at the cut | Give them an element and tag every mention |
| Two lines of dialogue collide | Add a linking word and bind each line to an action |
| Sliding feet, bent fingers | Name that artifact in `negative_prompt` |
| Composition ignores a stated layout | Raise `cfg_scale` toward 0.7 |
| Spoken line comes out in the wrong language | Write the line in Chinese or English — everything else is translated |

Grade the render with `analyze_video` and `detect_video_scenes` rather than
watching it, and `understand_video` when you need a written read of what
landed.

Adapted from fal's Kling 3.0 prompting guide and Kling 3.0 Pro usage notes:
https://blog.fal.ai/kling-3-0-prompting-guide/
https://fal.ai/learn/tools/how-to-use-kling-3-0-pro
