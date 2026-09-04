---
name: kling-video-prompting
description: Prompt Kuaishou's Kling video line from 2.5-turbo onward — which version exposes a shot list, tagged elements, native audio and a CFG dial at all, one shot per entry in multi_prompt rather than one paragraph, characters tagged @Element1/@Element2 so a face survives a cut, the labelled dialogue format native audio lip-syncs to, a negative prompt aimed at the artifacts Kling actually produces, and what motion-control takes instead of a prompt. Use whenever the model id names Kling 2.5-turbo, 2.6, v3, O1 or O3 (fal-ai/kling-video/v3/pro/text-to-video, fal-ai/kling-video/o3/pro/reference-to-video, fal-ai/kling-video/v2.6/pro/image-to-video, kling-3.0-omni/text-to-video, kling-2.6/text-to-video, kwaivgi/kling-v3.0-pro, kwaivgi/kling-video-o3-pro, kwaivgi/kling-o1) on generate_video, animate_image or a TextToVideo node. Not for Kling 1.x, 2.0 or 2.1, and not for Kling Image.
---

# Kling → write shots, not paragraphs

The newer Kling versions take a shot list rather than a prompt: one call
carries several shots, generates native audio with lip sync, and holds a tagged
character across every cut. A single dense paragraph throws all three away and
comes back as one drifting take.

Which of those you get depends on the version, so check before you write:

| Version | Shot list | Tagged elements | Native audio | cfg_scale / negative prompt |
| :--- | :--- | :--- | :--- | :--- |
| 2.5-turbo | — | — | — | yes |
| 2.6 | — | — | yes, on by default | yes |
| O1 | — | on the reference and video-to-video routes | — | — |
| v3 | yes | yes | yes, on by default | yes |
| O3 | yes | yes | yes, **off** by default | — |

Native audio belongs to the call that made it. Several separately generated
clips cut together drop their sound at each join — `video-audio-continuity`
covers the two builds that avoid it.

Reach it with `find_model` for `text_to_video` or `image_to_video`, then
`generate_video` / `animate_image`. Clips run 3–15 seconds, 720p to 4K,
in 16:9, 9:16 or 1:1. The prompt caps at 3072 characters.

## One shot per prompt

On v3 and O3, `multi_prompt` takes the shots and `prompt` takes a single shot;
they are mutually exclusive, so send one or the other. With `shot_type` (fal)
or `customize_multi_shots` (kie) set to customize, your shot boundaries are
used verbatim; set `intelligent` / `prefer_multi_shots` and the model cuts the
narrative itself. Pick customize whenever you know the beats. kie's omni
endpoint takes up to six shots.

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
the prompt addresses them as `@Element1`, `@Element2`. It is on v3, O3, and
O1's reference- and video-to-video routes. On the reference-to-video endpoints,
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

## Dialogue and native audio

`generate_audio` is on by default on 2.6 and v3, and **off** on every O3 route
— an O3 clip comes back silent unless you ask. It produces dialogue with lip
sync, plus ambience. Direct it with a labelled line:

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
- **Case matters for English speech.** Write it lowercase; reserve capitals for
  acronyms and proper nouns, which is how the model decides to spell a word out.

Chinese and English are voiced natively. Anything else is translated to English
before it is spoken, so write the line in the language you want heard.

## Controls

| Parameter | Where it exists | What to do with it |
| :--- | :--- | :--- |
| `cfg_scale` | 2.5-turbo, 2.6, v3 | 0.5 default; 0.3 for a freer read, 0.7 only when spatial layout is fixed |
| `negative_prompt` | 2.5-turbo, 2.6, v3 | Default is "blur, distort, and low quality"; add what you see — sliding feet, extra fingers, warped faces, jittery camera |
| `duration` | every route | 3–15s; each shot in a multi-shot list gets its own |
| `generate_audio` | 2.6, v3, O3 | Off costs less per second; leave it off when you are scoring in the timeline anyway |

Negative prompts earn their place here more than on most lines: Kling's
failures are limb and contact artifacts during fast motion, and naming the one
you are actually seeing suppresses it. O1 and O3 expose neither dial, so on
those the prompt is the whole instrument — spend the words the parameters would
have saved.

## Image to video

The image is the anchor. Prompt only the change — camera move, what the subject
does next, how the light shifts. Re-describing what is already in the frame
spends words and invites the model to re-render it slightly differently.
`start_image` and `end_image` together give you a move with a fixed landing
frame. Aspect ratio follows the input image; the parameter is ignored.

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
| One drifting take instead of beats | Move the shots into `multi_prompt` with `shot_type: customize`, or move to v3/O3 if your version has no shot list |
| An O3 clip came back silent | `generate_audio` defaults to false there |
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
