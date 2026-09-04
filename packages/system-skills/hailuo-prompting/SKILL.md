---
name: hailuo-prompting
description: Prompt MiniMax's Hailuo video line — the chronological beat order it animates from, the fifteen bracketed camera commands the Director endpoints accept and the three-per-bracket rule, when to switch prompt_optimizer off, why there is no negative prompt to fall back on, and prompting the delta on image-to-video. Use whenever the model id names Hailuo or MiniMax video-01 (fal-ai/minimax/hailuo-2.3/pro/text-to-video, fal-ai/minimax/hailuo-02/pro/image-to-video, fal-ai/minimax/hailuo-02-fast/image-to-video, fal-ai/minimax/video-01-director, fal-ai/minimax/video-01-subject-reference, hailuo/2-3-image-to-video-pro, minimax/hailuo-2.3, minimax/hailuo-02-fast) on generate_video, animate_image or a TextToVideo node. Not for MiniMax H3, which has its own guide.
---

# Hailuo → a sequence of beats, in order

Hailuo animates the order it reads. It has no negative prompt, no shot list and
no CFG dial, so every control you get is in the wording: what happens, in what
order, and how the camera behaves while it happens. Clips run 6 or 10 seconds
(10 s is unavailable at 1080p on Hailuo 02).

Reach it with `find_model` for `text_to_video` or `image_to_video`, then
`generate_video` / `animate_image`.

## Write the action as beats

Break one motion into the beats it is made of and connect them with sequencing
words — first, then, as, finally. The model animates that order.

> A skateboarder rolls toward a handrail in an empty underground car park.
> First he crouches low over the deck, then he pops the tail and the board
> snaps up under him, and as he lands on the rail the trucks grind along the
> steel, sparks trailing behind. Finally he drops off the end and rolls out of
> frame past a pillar.

Compare "a skateboarder does a trick on a rail", which gives the model the
whole choreography to invent and no reason to resolve it the way you meant.

Emotional beats work the same way. "She reads the letter with growing concern,
tears well up, then she crumples the paper and throws it" is three animatable
states; "she is sad about the letter" is one adjective.

## Camera

On the Director endpoints (`video-01-director` and its image-to-video form),
camera moves are commands in square brackets. Fifteen are supported:

`[Truck left]` `[Truck right]` `[Pan left]` `[Pan right]` `[Push in]`
`[Pull out]` `[Pedestal up]` `[Pedestal down]` `[Tilt up]` `[Tilt down]`
`[Zoom in]` `[Zoom out]` `[Shake]` `[Tracking shot]` `[Static shot]`

Two placement rules carry all of it. Commands inside one bracket happen at the
same time, capped at three: `[Truck left, Pan right, Zoom in]`. Commands at
different points in the prompt happen in that order:

```
[Static shot] The chef sets the plate down under the pass light. [Push in]
He wipes the rim with a cloth, then looks up. [Tilt up, Pan right] The dining
room comes into view behind him.
```

Every other Hailuo endpoint takes camera direction as prose only — "a slow
tracking shot follows her", "the camera racks focus from the leaves to her
face". Brackets there are just text.

## prompt_optimizer

On by default across the whole line, it rewrites your prompt with an LLM before
generation. Leave it on for a short prompt: it fills in the detail you did not
write. Switch it off once your prompt is a deliberate brief — it will otherwise
rewrite away the specific wardrobe, the specific light, and the beat order you
just spent effort on.

## Image to video

The frame is already decided. Prompt only what changes: motion, camera, light
over time, environment animation. Naming the subject briefly to anchor the
reference is fine — "the red-haired woman turns slowly to face camera" — but a
paragraph re-describing the still is a paragraph not spent on the delta.

Keep the framing consistent with the source. Asking a close-up input for a wide
establishing move is how you get a hallucinated body.

`video-01-subject-reference` holds a face across the clip from one reference
image; describe the person's action, not their appearance.

## No negative prompt

There is no field, and "no text, no watermark, not blurry" in the prompt is
read as content. Say what should be there instead. Empty sky, not "no birds".
A bare concrete wall, not "no graffiti".

## Symptoms

| What went wrong | What to change |
| :--- | :--- |
| The action resolves in the wrong order | Number the beats with first / then / as / finally |
| The camera drifts | Use a bracketed command on a Director endpoint, or name the move in prose |
| Your specifics disappeared | Set `prompt_optimizer` false |
| A body appears where the input image was cropped | Match the prompt's framing to the input |
| The thing you excluded shows up anyway | Rewrite the exclusion as a positive description |

Grade the render with `analyze_video` and `detect_video_scenes`, and
`understand_video` when you need a written read of what landed.

Adapted from MiniMax's camera-movement contract as documented on the fal
Director endpoints, and Akool's Hailuo prompt guide:
https://fal.ai/models/fal-ai/minimax/video-01-director/api
https://akool.com/blog-posts/minimax-hailuo-video-prompt-guide
