---
name: video-clone
description: Rebuild an existing video for a new product or cast in NodeTool — break a reference ad down shot by shot, then reproduce its structure with different content. Use when the user attaches or links a video and asks to copy, clone, remake, reverse-engineer, match, or "do it like this one", or wants to know why a reference ad works. Not for directing an original piece from a brief (use ugc-video or product-commercial).
---

**Load `/storyboard-core` first.** It carries the loop, the tool contract and
the gating this skill assumes. Everything below is the breakdown pass that comes
before that loop, and the rules for what may and may not be carried over.

## What makes this job type its own

The structure is given, so the work is reading it accurately and then rebuilding it
with different content. Two failure modes: describing the reference vaguely enough
that the rebuild is unrelated, and copying it closely enough that you reproduce
somebody's trademarks.

## Read the reference first

`find_model` with `capability: "generate_message"` for a model that reads video —
Gemini does it natively — then:

```
understand_video {provider, model, video, prompt, max_tokens}
```

`video` takes an asset id, an `asset://` URI, a URL or a data URI. It reads the whole
video, not sampled frames. Ask for one thing at a time rather than everything at once;
two or three calls read better than one overloaded prompt.

Extract, in this order:

1. **Frame:** aspect, total length, shot count.
2. **The first three seconds** — what the hook actually does, described as an action.
3. **Per shot:** in and out timecode, framing, camera height, camera move, who speaks,
   whether the product is visible and how.
4. **Audio recipe:** dialogue, voiceover, room tone, music, and whether the sound is
   diegetic.
5. **One paragraph on why it works** — the mechanism, not praise.

Report the breakdown and stop. It is worth reading before anything renders.

## What carries over, and what must not

| Carry over | Replace |
|---|---|
| Cut rhythm — each shot's duration | The room, the set, the location |
| Camera heights and framings | Wardrobe and casting |
| The order of beats: hook, demonstration, verdict | Every spoken line |
| Whether the sound is diegetic | The product |
| Aspect ratio and total length | The palette, unless the user asks to match it |

**Never carry a trademark across.** Logos, wordmarks, brand colours as identity,
slogans, packaging layout and any readable sign in the reference stay out of the
rebuild. Put `no brand marks other than [PRODUCT]` in the board `style`. If the user
asks for the reference's actual logo, say plainly that the rebuild uses their product
and nothing else, and carry on with the rest.

## Rebuild

Map each extracted shot to one `add_shot`, keeping its duration as
`duration_seconds` and its framing in `camera.framing` — and repeat the framing and
camera height in the `action` text, since only `framing` reaches the still prompt.

Cast before rendering: a character entity from a generated reference you show the user
first, and a prop entity from their pack shot. Slug the shots `1a`, `2a`, … so the
user can name one against the reference's own numbering.

Then run the core loop: stills, take selection, clips.

## Brief

```
Read the attached reference video with understand_video (find a model that reads
video via find_model, capability=generate_message — Gemini reads it natively).

Extract: aspect, length, shot count; what the first three seconds do; then per
shot the in/out timecode, framing, camera height, move, who speaks and whether
the product is visible. Then the audio recipe, then one paragraph on the
mechanism that makes it work.

Report that and stop.

Then rebuild it for [PRODUCT] with a new character. Keep the cut rhythm, the
durations and the camera heights. Change the room, the wardrobe and every line.
Carry no trademark from the reference — board style gets "no brand marks other
than [PRODUCT]".

Cast from stills first: generate the character reference, show me, then tag it.
Slug every shot so I can say "fix 2a".
```
