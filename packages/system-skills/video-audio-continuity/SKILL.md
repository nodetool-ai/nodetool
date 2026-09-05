---
name: video-audio-continuity
description: Keep sound continuous across a multi-scene piece cut from generated video — why one clip per scene hard-cuts the audio at every boundary, when to write all the scenes into a single generation instead, the sound-design vocabulary that survives a provider's copyright filter, and how to check the length, the aspect ratio and the mix of what came back. Use when a piece has more than one scene and the video model writes its own audio (Seedance 2, Veo 3, MiniMax H3, Kling 2.6 and later), or when a cut's sound drops out at the shot changes.
---

# One clip, one bed

A generated clip carries its own audio, and that audio starts and stops at the
clip's own edges. So the obvious build — one generated clip per shot, laid end
to end — hard-cuts or drops to silence at every boundary. Stills and contact
sheets never show it; it only exists on playback, and it is the most common
audio defect in a multi-scene piece.

## The rule

When sound has to carry across the scene changes, generate **one** clip holding
**all** the scenes.

- One `generate_video` call, the scenes written as "cut to" beats inside the
  prompt, and one continuous audio brief across the whole thing.
- Lay that clip under the sequence as the base bed and time the type and
  graphics to it.
- Use a model line that writes native audio, and load its prompting skill first:
  `seedance-2-prompting` (its JSON beat sheet is built for exactly this — global
  `audio_note`, one `audio` line per beat), `veo-3-prompting`,
  `minimax-h3-prompting`, `kling-video-prompting`.

Separate per-shot clips are right in two cases:

- the piece is silent, or
- the continuity comes from a track you add yourself — narration from
  `generate_speech` (or `voice_script_lines`, which voices every line of a
  board's script in one call), a bed from `generate_music` — on its own
  timeline track. Then the visual beds can be separate and the shots are muted
  under it. `elevenlabs-audio-prompting` directs the voice and the music plan,
  `stable-audio-prompting` the bed and any effects; a bed generated with a
  stated BPM is a bed whose grid `beat-sync-editing` already knows.

Two video lines force the second build: Wan 2.6 takes an audio file as input
but writes none, and Hailuo has no native audio at all, so a piece on either
gets its sound from a track of your own.

On a storyboard this means one shot, not seven. A board whose shots each render
their own native-audio clip cannot be assembled into a continuous mix; decide
which of the two builds you are doing before the first render, because the fix
afterwards is a re-render. The board skills (`commercial-beat-sheet`,
`trailer-template`, `explainer-storyboard`, `music-video-treatment`) each say
which build they default to; the sound brief itself goes into the shot's
`motion` and `action`, the only fields the clip prompt is built from.

## A sound brief that is not refused

Providers copyright-filter the generated audio track, and a brief asking for a
"swell", a "chord", a "score", a "soundtrack" or a named musical genre can come
back blocked — failing the whole render, not just the audio. For an underscore,
describe sound design instead:

- Hum, digital pulses, ticking, airy whooshes, risers, sparkle textures, one low
  sub-bass boom.
- Close with "no music, no melody, no song, no voice".
- Put each transition in the sound design — a whoosh on every "cut to" — not in a
  musical cue. A cue tends to restart at the cut, which is the discontinuity you
  are avoiding.

Dialogue is not affected by this: quoted lines are the model's own voice track,
and the model-line skill says how to write them.

## Check what came back

- **Length.** `duration_seconds` is honoured loosely and clamped to the lengths a
  model supports. Measure with `analyze_video` before cutting to it.
- **Frame.** Aspect ratio is not guaranteed — an image-to-video route often
  ignores a 9:16 source and emits 16:9. `analyze_video` reports it; fix it with
  an `ffmpeg` crop to the target frame before compositing, not after.
- **The mix.** Judge it with `understand_video` (Gemini gets the audio; every
  other vision model is sent silent stills), `analyze_audio` for the levels, and
  `detect_video_scenes` to confirm the cuts landed where the beats said. Never
  from a contact sheet.
- **The file.** Build on a stored asset. `generate_video` saves its result;
  probing a generation node with `invoke_node` hands back whatever the node
  returned, which can be a run-local path that is gone by the time you assemble.

## Where the rest picks up

`motion-graphics` carries the timeline op contract for laying the bed and muting
shot audio under a narration track. `beat-sync-editing` sits the cuts on that
bed once it exists, and `caption-titles` times the type to it — a title card is
never rendered into the clip, whichever build you chose.
