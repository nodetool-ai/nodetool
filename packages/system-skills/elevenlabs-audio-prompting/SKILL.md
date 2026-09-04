---
name: elevenlabs-audio-prompting
description: Direct ElevenLabs speech, dialogue, sound effects and music — the bracketed audio tags v3 acts on and why the voice decides whether a tag lands, stability as the delivery dial, punctuation instead of SSML for pacing, the per-line dialogue format for several speakers, source-action-space sound-effect briefs with prompt_influence and looping, and the music composition plan that pins a song's sections. Use whenever the model id names an ElevenLabs generation endpoint (fal-ai/elevenlabs/tts/eleven-v3, fal-ai/elevenlabs/tts/multilingual-v2, fal-ai/elevenlabs/text-to-dialogue/eleven-v3, fal-ai/elevenlabs/sound-effects/v2, fal-ai/elevenlabs/music, elevenlabs/text-to-speech-multilingual-v2, elevenlabs/text-to-dialogue-v3, elevenlabs/v2-multilingual, elevenlabs/turbo-v2.5) on generate_speech, generate_music or a TextToSpeech node. Not for the transcription, dubbing or isolation endpoints, which take no prompt.
---

# ElevenLabs → direct the read, don't just submit the text

The text is the smallest part of an ElevenLabs request. What decides whether it
sounds directed is the voice you picked, the stability you set, and the tags
and punctuation carrying the performance.

Reach speech with `find_model` for `text_to_speech`, then `generate_speech`;
music with `find_model` for `text_to_music`, then `generate_music`. The
sound-effects endpoint is not in either catalog — run its node with
`search_nodes` and `invoke_node`.

## Voice first, then tags

A tag only does what the voice can already do. `[shouts]` on a voice trained on
soft narration produces a slightly louder narration. Pick a voice whose range
covers the delivery you want, then direct within it.

- **Emotionally varied** voices take direction across a scene.
- **Narrow, consistent** voices are right when every line is the same register.
- **Neutral** voices are the most stable across languages and styles.

## Stability is the delivery dial

The single most consequential setting. ElevenLabs exposes it as three named
settings; the numeric APIs take the same three values, and the dialogue
endpoint rounds anything else to the nearest of them.

| Value | Behaviour | Use for |
| :--- | :--- | :--- |
| 0.0 — creative | Most expressive, most responsive to tags, occasional hallucination | Character work, dialogue, anything with `[whispers]` or `[laughs]` |
| 0.5 — natural | Balanced, closest to the reference recording | Narration, most production reads |
| 1.0 — robust | Very consistent, largely ignores directional tags | Long documents, repeated renders that must match |

At 1.0 your tags stop working. If a tag is being ignored, check stability
before rewriting the tag.

## Audio tags

Bracketed, inline, and they act from that point in the line. They are a v3
feature: on multilingual-v2, turbo and flash there is nothing to act on them,
and punctuation plus sentence structure are the only direction you have.

- **Delivery**: `[whispers]`, `[shouts]`, `[sarcastic]`, `[curious]`,
  `[excited]`, `[mischievously]`
- **Reactions**: `[laughs]`, `[sighs]`, `[crying]`, `[clears throat]`,
  `[snorts]`
- **Environment**: `[applause]`, `[clapping]`, `[gunshot]`, `[explosion]`
- **Experimental**: `[sings]`, `[strong French accent]`

Punctuation carries the rest, and v3 does not support SSML break tags. Ellipses
are pauses and hesitation, capitals are emphasis, ordinary commas and full
stops set the rhythm:

> [sighs] It was a VERY long day … nobody listens any more. [quietly] Maybe
> that's the point.

Give the model a few sentences rather than a fragment. Short isolated lines
deliver inconsistently because there is no context to read the register from.
`language_code` forces a language when the text alone is ambiguous.

## Several speakers

The dialogue endpoint takes a list of `inputs`, each with its own text and
voice, rather than one block of text with names in it. Tag each line for its
own delivery, and write interruptions as they happen:

```
[Ana, voice A]  "You said you'd call." [flat]
[Ruben, voice B] [defensive] "I did — twice —"
[Ana, voice A]  [cutting in] "Once. And you hung up."
```

Distinct voices per speaker is what makes it a conversation; the same voice
twice reads as one person talking to themselves.

## Sound effects

Brief them as source, action and space: what makes the sound, what happens to
it, and the room it happens in.

> A heavy oak door swinging shut and latching in a stone corridor, long natural
> reverb tail, close mic on the latch.

- `duration_seconds` runs 0.5–22; leave it unset and the model infers a length
  from the prompt. Impacts want 1–3 s, beds want 10–20 s.
- `prompt_influence` defaults to 0.3. Raise it toward 1 to follow the brief
  closely and lose variation; lower it when you want takes to choose from.
- `loop` makes the tail blend into the head — the setting for ambience and game
  audio, and pointless for a one-shot.

## Music

A prompt gets you a track: genre, instrumentation with character, tempo in bpm,
emotional arc, and what it is for.

> Fast-paced electronic chase cue for a game trailer, driving synth arpeggios,
> punchy drums, distorted bass, rising tension with abrupt transitions,
> 130–150 bpm.

When the structure matters more than the vibe, send a `composition_plan`
instead: an ordered list of sections, each with its own `durationMs`,
`positiveStyles` and `negativeStyles`. That is what makes an intro stay sparse
and a drop actually land where you wanted it. `respect_sections_durations`
enforces those lengths; `music_length_ms` applies only to the prompt path.
`force_instrumental` guarantees no vocal — without it, a prompt that does not
mention vocals may still come back sung.

Naming an artist, a band or copyrighted lyrics is rejected outright; the error
carries a rephrasing suggestion. Describe the sound instead of the reference.

## Symptoms

| What went wrong | What to change |
| :--- | :--- |
| Tags do nothing | Lower stability to 0.5 or 0.0, and check the voice can do that delivery |
| The read is flat | Add punctuation and a delivery tag; stop relying on the words alone |
| Pauses are ignored | Use ellipses and line structure — SSML breaks are not supported |
| Two speakers sound the same | Assign a different voice per `inputs` entry |
| The effect is too variable | Raise `prompt_influence`, and set an explicit duration |
| A loop clicks | Set `loop` true and regenerate rather than trimming |
| A song ignores its structure | Move from a prompt to a `composition_plan` |
| The prompt was refused | Remove artist and band names; describe the sound |

Check the result with `analyze_audio` and `detect_audio_events` rather than
listening through it, and `transcribe_audio` when you need to prove the words
landed as written.

Adapted from the ElevenLabs prompting documentation for Eleven v3, sound
effects and music:
https://elevenlabs.io/docs/best-practices/prompting/eleven-v3
https://elevenlabs.io/docs/overview/capabilities/sound-effects
https://elevenlabs.io/docs/eleven-api/guides/cookbooks/music.md
