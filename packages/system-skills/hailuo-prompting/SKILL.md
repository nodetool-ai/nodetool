---
name: hailuo-prompting
description: Prompt MiniMax's Hailuo video line — the chronological beat order it animates from, the fifteen bracketed camera commands the Director endpoints accept and the three-per-bracket rule, when to switch prompt_optimizer off, why there is no negative prompt to fall back on, and prompting the delta on image-to-video. Use whenever the model id names Hailuo or MiniMax video-01 (fal-ai/minimax/hailuo-2.3/pro/text-to-video, fal-ai/minimax/hailuo-02/pro/image-to-video, fal-ai/minimax/hailuo-02-fast/image-to-video, fal-ai/minimax/video-01-director, fal-ai/minimax/video-01-subject-reference, hailuo/2-3-image-to-video-pro, minimax/hailuo-2.3, minimax/hailuo-02-fast, and the direct MiniMax provider's MiniMax-Hailuo-2.3, MiniMax-Hailuo-02, T2V-01-Director, I2V-01-Director and S2V-01) on generate_video, animate_image, generate_video_from_references or a TextToVideo node. Not for MiniMax H3, which has its own guide.
---

# Hailuo → a sequence of beats, in order

Hailuo animates the order it reads. It has no negative prompt, no shot list and
no CFG dial, so every control you get is in the wording: what happens, in what
order, and how the camera behaves while it happens. Clips run 6 or 10 seconds
(10 s is unavailable at 1080p on Hailuo 02).

Reach it with `find_model` for `text_to_video` or `image_to_video`, then
`generate_video` / `animate_image`. Those forward only the prompt (and the
image), the duration, the aspect ratio and the resolution. `prompt_optimizer`
exists only on the route's own node: find it with `search_nodes`, read its
fields with `get_node_info`, and run it with `run_node`.

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

On the Director endpoints (`video-01-director` and its image-to-video form,
and MiniMax's own `T2V-01-Director` and `I2V-01-Director`), camera moves are
commands in square brackets. Fifteen are supported:

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

The bracket contract is documented for the Director endpoints only, so on
every other Hailuo endpoint write camera direction as prose — "a slow tracking
shot follows her", "the camera racks focus from the leaves to her face".

## prompt_optimizer

It rewrites your prompt with an LLM before generation. It defaults to true on
every fal and Replicate Hailuo and video-01 route and to false on kie's Hailuo
02 routes. kie's Hailuo 2.3, the AtlasCloud routes and the direct MiniMax video
models have no such field. Leave it on for a short prompt: it fills in the
detail you did not write. Switch it off once your prompt is a deliberate brief
— it will otherwise rewrite away the specific wardrobe, the specific light, and
the beat order you just spent effort on.

## Image to video

The frame is already decided. Prompt only what changes: motion, camera, light
over time, environment animation. Naming the subject briefly to anchor the
reference is fine — "the red-haired woman turns slowly to face camera" — but a
paragraph re-describing the still is a paragraph not spent on the delta.

Keep the framing consistent with the source. Asking a close-up input for a wide
establishing move is how you get a hallucinated body.

`video-01-subject-reference` (and MiniMax's own `S2V-01`, reached through
`generate_video_from_references`) holds a face across the clip from one
reference image; describe the person's action, not their appearance.

## No negative prompt

There is no field, and "no text, no watermark, not blurry" in the prompt is
read as content. Say what should be there instead. Empty sky, not "no birds".
A bare concrete wall, not "no graffiti".

## Symptoms

| What went wrong | What to change |
| :--- | :--- |
| The action resolves in the wrong order | Number the beats with first / then / as / finally |
| The camera drifts | Use a bracketed command on a Director endpoint, or name the move in prose |
| Your specifics disappeared | Set `prompt_optimizer` false on the route's node |
| A body appears where the input image was cropped | Match the prompt's framing to the input |
| The thing you excluded shows up anyway | Rewrite the exclusion as a positive description |

Grade the render with `analyze_video` and `detect_video_scenes`, and
`understand_video` when you need a written read of what landed.

Adapted from MiniMax's camera-movement contract as documented on the fal
Director endpoints, and Akool's Hailuo prompt guide:
https://fal.ai/models/fal-ai/minimax/video-01-director/api
https://akool.com/blog-posts/minimax-hailuo-video-prompt-guide
