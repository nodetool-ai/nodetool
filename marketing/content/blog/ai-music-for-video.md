---
title: "AI music for video: how to score a generated clip in 2026"
description: "Add a soundtrack to an AI video with Lyria, ElevenLabs Music, MiniMax Music, Suno or a video-to-music model, then trim, fade and mix it under the picture."
headline: "AI music for video: how to score a generated clip"
excerpt: "Four ways to put music under an AI clip, from native audio in the video model to a track written for the cut. A 30-second score costs between half a cent and forty cents at provider rates."
tag: Guide
date: 2026-10-08
author: "The NodeTool team"
accent: emerald
ogImage: creatives_workflow.png
priority: 0.7
changeFrequency: monthly
---

There are four ways to score an AI-generated clip. You can let the video model generate its own audio, generate a music track from a text brief, generate music from the video itself, or write lyrics and generate a song. For most clips the second option gives the most control for the least money: a 30-second instrumental from Lyria 3 costs $0.04 at fal's list price, so ten drafts cost the same as one second of Veo 3 on Replicate at $0.40.

The music is rarely the hard part. The hard part is the length, the level and the edges: a track that runs past the picture, sits too loud under dialogue, or starts with a click. This guide covers the four approaches, then the five nodes that fit any track to any clip.

Prices are the per-track or per-second rates in the provider catalogs NodeTool bills against, read in July 2026. You pay them on your own key, at [provider rates](/pricing).

## Quick answer

- **One-off clip, no dialogue:** generate an instrumental with Lyria 3 or ElevenLabs Music, then trim, fade and mix it with the [Score a Silent Clip](/templates/score-a-silent-clip) template.
- **Music that follows the picture:** Sonilo video-to-music reads the clip and writes to it, at $0.009 per second.
- **Sound and picture in one generation:** [Veo 3](/models/veo-3) and [Sora 2](/models/sora) return audio with the clip. You get less control over the music.
- **A song with vocals:** MiniMax Music or Suno, with lyrics marked up by section.
- **Sound effects instead of music:** ElevenLabs Sound Effects v2 at $0.002 per second, or a video-to-audio foley model such as Hunyuan Video Foley.

## Four ways to add music

| Approach | Example models | Control over the music | Typical cost for 30 s |
| :--- | :--- | :--- | ---: |
| Native audio from the video model | Veo 3, Sora 2, Kling 3, Seedance 2.5 | Low: one prompt drives picture and sound | Included in the video price |
| Text to music | Lyria 3, ElevenLabs Music, Stable Audio 2.5, ACE-Step | High: you write the brief | $0.006 to $0.40 |
| Video to music | Sonilo v1.1 | Medium: the model reads the clip | $0.27 |
| Song from lyrics | MiniMax Music 2.6, Suno via kie | High, with vocals | $0.15 per track on fal |

**Native audio** is the fastest route and the least editable. The audio is baked into the clip, so changing the music means regenerating the shot. Several video nodes expose this as a switch: `generate_audio` on Veo 3.1, Kling 3 and Seedance on fal, and `sound` on Kling through [kie](/providers/kie). It suits UGC-style clips, where a voice and room sound matter more than a score. For a cut of several shots, native audio gives you a different piece of music under every shot.

**Text to music** is what most edits want. You get a separate audio file, you can make several and pick one, and the picture is untouched.

**Video to music** sits in between. Sonilo's video-to-music node (`fal.video_to_audio.SoniloV11VideoToMusic`) takes the clip and an optional prompt and returns a track timed to it. Use it when cuts and motion should drive the music and you do not want to describe them.

**Songs** need lyrics. See the lyrics section below.

## Text-to-music models compared

| Model | Provider | Price at fal list | Notes |
| :--- | :--- | ---: | :--- |
| ACE-Step | fal | $0.0002 per second | Open-weight, `instrumental` switch, 60 s default |
| Lyria 3 | fal | $0.04 per track | Google's music model |
| Lyria 3 Pro | fal | $0.08 per track | Higher tier of the same model |
| Lyria 2 | fal | $0.10 per 30 s |  |
| MiniMax Music 2.6 | fal | $0.15 per track | Takes lyrics |
| Stable Audio 2.5 | fal | $0.20 per track | Up to 190 s by default |
| ElevenLabs Music | fal | $0.80 per minute | `force_instrumental` switch, length in milliseconds |

You do not have to pick a provider node. **Text To Music** (`nodetool.audio.TextToMusic`) takes a prompt, optional lyrics and a duration from 1 to 300 seconds, and its model picker lists every music model your keys reach on fal, [Replicate](/providers/replicate), kie (Suno) and [MiniMax](/providers/minimax). Swap the model and the rest of the graph stays the same. The [text-to-music task page](/tasks/text-to-music) lists more options.

## Step 1: write the music brief from the picture

A music prompt that says "epic cinematic music" gets the same track as everyone else's. Write it from what the clip does:

- **Tempo and energy over time.** "Starts sparse, builds from 0:08, peaks at the product reveal around 0:20, resolves by 0:28."
- **Instruments, not adjectives.** "Muted piano, brushed snare, warm upright bass" says more than "uplifting".
- **What the music must not do.** "No vocals. No drop. Leave room for a voiceover in the mid range."
- **The length.** Set `duration` to the clip length plus a second or two, so there is material to fade.

If you would rather describe the mood than the music, the [Score a Clip from Its Own Mood](/templates/score-a-clip-from-its-own-mood) template puts an Agent node in front of Text To Music. You write "tense, then relieved" and the agent writes the music brief.

## Step 2: generate several and listen

Two runs of the same music brief can sound very different. At $0.04 a track, generate four and choose one rather than rewriting the brief after a single bad result. In a NodeTool graph, run the Text To Music node a few times and compare the previews, or put a list of four briefs in front of it and let it run once per brief.

## Step 3: fit the track to the clip

This is the part that makes a generated score sound finished. The [Score a Silent Clip](/templates/score-a-silent-clip) template wires it as one chain:

1. **Get Video Info** (`nodetool.video.GetVideoInfo`) reads the clip's duration.
2. **Trim** (`nodetool.audio.Trim`) cuts the track to that duration.
3. **Normalize** (`nodetool.audio.Normalize`) evens out the level, so a quiet generation and a loud one land close together.
4. **Fade In** and **Fade Out** (`nodetool.audio.FadeIn`, `nodetool.audio.FadeOut`) remove the click at each end. A trimmed track almost always ends mid-phrase, and the fade is what hides it.
5. **Add Audio** (`nodetool.video.AddAudio`) puts the track under the picture. With `mix` off it replaces the clip's audio. With `mix` on it sits under the existing sound, at the level you set with `volume`. `output_length` set to `video` trims or pads the audio to the picture.

If the clip already has dialogue or native sound, turn `mix` on and set `volume` around 0.2 to 0.3, then listen. For a voiceover over music, the [Narration with a Music Bed](/templates/narration-with-a-music-bed) template lowers the music with two Gain nodes before Overlay Audio joins them.

## Step 4: or score the whole cut on the timeline

For a sequence of several shots, score the cut instead of each clip. NodeTool's timeline has audio tracks that mix together with per-clip gain and fades, per-track mute, solo and volume, and track effects for gain, 3-band EQ, filtering and compression. On an audio track you can generate music directly, then drag the corner grips (or press `Alt + T`) to add fades. Export mixes the audio and muxes it with the video.

The agent can do the same: ask it to "add a quiet piano bed under the whole cut" and it generates the track, places it on an audio track and sets the level. It can also pulse a title or graphic to the beat of the music with its `bake_audio_animation` tool.

## Writing lyrics for a song

Vocal models read section tags to decide where the verse, chorus and bridge go. MiniMax's music node documents `[Intro]`, `[Verse]`, `[Chorus]`, `[Bridge]` and `[Outro]`, and requires lyrics. A structure that works:

```
[Intro]

[Verse]
Coffee on the counter, city coming through
Same street, same train, something new

[Chorus]
Wake up, wake up, the morning's yours
Open every window, open every door

[Outro]
```

Four rules keep the result singable:

- **Short lines.** Six to nine syllables per line leaves room for the melody.
- **Repeat the chorus word for word.** Models treat a repeated block as the hook.
- **Keep the style out of the lyrics.** Put genre, tempo and voice in the prompt, not inside the sections.
- **Leave empty sections for instrumental parts.** An empty `[Intro]` gives you a lead-in before the vocal starts, which is where the opening shot usually sits.

On kie, Suno's `GenerateMusic` node takes lyrics, a separate `style` field, a `title`, an `instrumental` switch, a vocal gender and models from V4 to V6, with durations from 10 to 360 seconds in custom mode.

## What a score costs

| Job | Plan | Total |
| :--- | :--- | ---: |
| 15 s social clip | 4 Lyria 3 drafts, keep one | $0.16 |
| 30 s product ad | 4 Lyria 3 Pro drafts | $0.32 |
| 60 s explainer bed | 2 ElevenLabs Music takes of 60 s | $1.60 |
| 30 s clip scored from the picture | 2 Sonilo video-to-music takes | $0.54 |
| 30 s clip, foley only | 1 Hunyuan Video Foley pass | $0.30 |

The most expensive row costs about as much as four seconds of Veo 3 at $0.40 per second. Sound is the cheapest part of an AI video to improve.

## Checklist

1. Decide whether the music needs to be editable. If yes, do not rely on native audio.
2. Write the brief from the clip's timing, with instruments and exclusions.
3. Set the duration to the clip length plus a little.
4. Generate several takes and pick one.
5. Trim, normalize and fade before you mix.
6. Mix under dialogue at a low volume, and listen at the end of the clip, where trims fail.

## FAQ

### What is the best AI music generator for video?

For background music under a clip, Lyria 3 and ElevenLabs Music are strong starting points: Lyria 3 costs $0.04 per track on fal and ElevenLabs Music $0.80 per minute with an instrumental switch. For music that follows the cut, use a video-to-music model such as Sonilo. For songs with vocals, use MiniMax Music or Suno.

### Can AI video models generate their own music?

Yes. Veo 3 returns dialogue, sound effects and music with the clip, and Sora 2 also generates audio. Kling, Seedance and Wan offer audio generation on some versions. The music is baked into the clip, so you cannot change it without regenerating the shot.

### How do I make the music the same length as the video?

Read the clip's duration with Get Video Info, trim the track to it with the audio Trim node, and add a short fade-out so the cut does not click. Add Audio with `output_length` set to `video` also trims or pads the audio to the picture.

### Can I use AI-generated music commercially?

That depends on the model provider's terms, not on NodeTool. NodeTool calls the provider on your own key, so the provider's licence for that model applies. Check the terms of the model you use before you publish.

### Do I need a GPU to generate music?

No. The models above run on the providers' servers and are called with your own key. ACE-Step and MusicGen are open-weight models. In NodeTool they run through fal and Replicate, and MusicGen is the default model of the Text To Music node.

## Read next

- [Score a Silent Clip template](/templates/score-a-silent-clip) — Generate, trim, fade and mix a track in one graph.
- [Text to music](/tasks/text-to-music) — Music models and how to run them.
- [Narration with a Music Bed](/templates/narration-with-a-music-bed) — Voice and music mixed at the right levels.
- [Music video solutions](/solutions/music-video) — Build the picture around the track instead.
