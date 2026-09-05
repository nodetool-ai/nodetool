---
name: stable-audio-prompting
description: Prompt Stability's Stable Audio line — the genre/instruments/mood/BPM order its training metadata expects, the TrackType and VocalType tags that separate music, stems and sound effects on Stable Audio 3, matching duration to what you described, which checkpoints guidance_scale and step count actually affect, and prompting the inpaint, outpaint and audio-to-audio variants where the surrounding audio outranks the prompt. Use whenever the model id names Stable Audio (fal-ai/stable-audio-25/text-to-audio, fal-ai/stable-audio-3/medium/text-to-audio, fal-ai/stable-audio-3/small/music/text-to-audio, fal-ai/stable-audio-3/small/sfx/text-to-audio, fal-ai/stable-audio-3/medium/audio-to-audio, fal-ai/stable-audio-25/inpaint, stability-ai/stable-audio-2.5) on generate_music or an audio generation node.
---

# Stable Audio → write the metadata, not a mood

Stable Audio was trained on library-music metadata, so it responds to prompts
shaped like library-music metadata: what the genre is, what is playing, how it
feels, how fast it goes. Poetic descriptions of a feeling get a generic bed.

Reach the music endpoints with `find_model` for `text_to_music`, then
`generate_music`. The SFX checkpoints and the audio-to-audio, inpaint and
outpaint variants are not in the music catalog — run those nodes with
`search_nodes` and `invoke_node`.

## Music prompts

Four elements, in this order:

1. **Genre** — the core style, first.
2. **Instruments** — with character, not just names. "Smooth electric piano",
   "textural percussion", "distorted bass" carry more than "piano, drums,
   bass".
3. **Mood and production** — the feel, plus the production era or treatment.
4. **BPM** — and the key when it matters.

> An exciting breakbeat instrumental for a fast-paced game, funky electric
> guitar chords, steady break drums, smooth electric piano and supporting bass.
> Fresh, modern and adventurous, 105 BPM.

Two habits that measurably help: vary the vocabulary instead of repeating the
same adjective, and reference an era to describe production — "80s gated
reverb", "90s grunge distortion" — which encodes a whole chain in three words.

On Stable Audio 3, prefix the type. `TrackType: Music, VocalType: Instrumental`
is the tag pair for instrumental beds and is worth setting explicitly; the
model otherwise decides whether to bring in a vocal.

## Stems and single instruments

Start with `TrackType: Instrument`, then the instrument, genre, mood and BPM.
This is the path for something that has to sit in a mix rather than be the mix.
Playing technique, recording environment and effects all read: "close-mic'd
upright bass, fingered, small wooden room, light tape saturation".

## Sound effects

`TrackType: SFX`, then three things:

1. **Source** — the object or instrument making the sound.
2. **Action** — how it is triggered, how long it rings, how it decays.
3. **Production** — mic placement, room character, processing.

> TrackType: SFX. A steel toolbox lid slamming shut on a concrete workshop
> floor, sharp metallic impact with a short rattling decay, close mic, small
> room with a hard early reflection.

Then set a short duration. Most effects are under two seconds, and a 30-second
request for a door slam gets you a door slam followed by 28 seconds of room.

## Duration and parameters

Match the duration to what you described. The Stable Audio 3 medium checkpoint
goes to 380 seconds, but a prompt describing a loop or a hit produces its best
result when the length fits the description; for a music bed, 60–90 seconds is
the range the guide recommends. Note the field changes name — `seconds_total`
on 2.5, `duration` on 3 — and 2.5 defaults to 190 seconds, which is three
minutes of audio nobody asked for.

| Parameter | What it does | Where to sit |
| :--- | :--- | :--- |
| `num_inference_steps` | Sampling steps | The distilled checkpoints are tuned for the default 8 and gain little above it; raise it only on a `base` checkpoint |
| `guidance_scale` | Prompt adherence | On Stable Audio 3, effective only on `base` (non-distilled) checkpoints — raising it on a distilled one changes nothing |
| `negative_prompt` | Qualities to avoid (Stable Audio 3 only) | Name the artifact you hear: "clipping", "muddy low end", "vocal chops" |
| `enable_prompt_expansion` | LLM prompt rewrite | Off by default; useful for a three-word prompt, harmful once your prompt is already metadata |
| `seed` | Comparability | Pin it while you change one element at a time |

The `base` versus distilled split is the one that catches people: on a
distilled Stable Audio 3 checkpoint the two dials most people reach for do
nothing, and the prompt is the whole instrument.

## Editing existing audio

**Audio-to-audio** seeds generation from a clip, and the dial has two names.
Stable Audio 3 takes `init_noise_level` (0.9 default): 0.1 keeps the source
close, 1.0 replaces it with noise and generates outright. Stable Audio 2.5
takes `strength` (0.8 default), which runs the same way — 0 returns the input.
Low keeps melody and rhythm; high strips them and keeps only broad character.

**Inpaint and outpaint** hold everything outside a masked region and regenerate
inside it — `mask_start_seconds` / `mask_end_seconds` on Stable Audio 3,
`mask_start` / `mask_end` on 2.5. Here the surrounding audio matters more than
the prompt: a short mask is pulled hard toward its context regardless of what
you wrote, and only a wide mask gives the prompt room. If an inpaint is
ignoring you, widen the mask before rewriting the prompt.

## Symptoms

| What went wrong | What to change |
| :--- | :--- |
| A generic bed | Rewrite as genre, instruments with character, mood, BPM |
| An unwanted vocal | Add `TrackType: Music, VocalType: Instrumental` to the prompt |
| The effect is padded with room tone | Cut the duration to the length of the actual event |
| Raising guidance changed nothing | You are on a distilled checkpoint — switch to `base` or fix the prompt |
| An inpaint ignores the prompt | Widen the masked region |
| Two takes are not comparable | Pin the seed and change one element |

Check the result with `analyze_audio`, `analyze_audio_spectrum` and
`detect_audio_events` rather than listening for it — a missing instrument or a
clipped peak shows up there faster than by ear.

## Where it lands

A bed from here is the "track of your own" build in `video-audio-continuity`:
one clip on its own audio track for the whole runtime, with the generated shots
muted under it. Because the prompt states the BPM, `beat-sync-editing` starts
with a grid it can predict and then confirms with `detect_audio_events` on the
file. A `TrackType: SFX` hit of 1–3 s is what `logo-reveal` lands a mark on.
`motion-graphics` carries the timeline ops that lay the clip down.

Adapted from Stability's Stable Audio 2.5 prompt guide and the Stable Audio 3
prompting guide:
https://stability.ai/implementations/stable-audio-25-prompt-guide
https://github.com/Stability-AI/stable-audio-3/blob/main/docs/guides/prompting.md
