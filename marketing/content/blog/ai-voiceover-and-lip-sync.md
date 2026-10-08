---
title: "How to add an AI voiceover and lip sync to a video in 2026"
description: "Voice a script with ElevenLabs, Gemini, MiniMax or local Kokoro, sync a face to it with Sync, LatentSync or HeyGen, and caption it from the same take."
headline: "How to add an AI voiceover and lip sync to a video"
excerpt: "Write the script first, voice it line by line, and let the take lengths set the cut. A 60-second voiceover costs under ten cents. Lip sync is the expensive step, from $0.005 to $0.17 per second of footage."
tag: Guide
date: 2026-10-08
author: "The NodeTool team"
accent: cyan
ogImage: usecase_audio.png
priority: 0.7
changeFrequency: monthly
---

To add an AI voiceover to a video, write the script, generate speech with a text-to-speech model, and lay the audio under the picture. To make an on-screen face speak it, run the clip and the audio through a lip-sync model. At provider rates a 60-second voiceover costs between half a cent and nine cents. Lip sync costs between $0.005 and $0.17 per second of footage, so the face is where the budget goes.

The order matters more than the models. Voice first, then cut to the voice, then sync. A voiceover laid over a finished edit never fits, and a lip-synced shot that gets re-timed afterwards has to be synced again. This guide covers the order, the models for each step, and the NodeTool graph and script flow that tie them together.

Prices come from the provider catalogs NodeTool bills against, read in July and August 2026. You pay them on your own key, at [provider rates](/pricing).

## Quick answer

- **Narration over b-roll:** ElevenLabs v3 or Multilingual v2 at $100 per million characters. A 60-second script is about 900 characters, so about nine cents.
- **Cheapest voice:** Kokoro at $4 per million characters on [Together AI](/providers/together-ai), or locally with no key at all (English only).
- **A presenter clip that must say new words:** Sync Lipsync v2 at $3 per minute of footage, the default in NodeTool's Lip Sync node.
- **A talking head from one photo:** OmniHuman 1.5 at $0.16 per second or Kling AI Avatar v2 Pro at $0.115 per second.
- **Captions:** reuse the word timings from the voiceover take. Don't transcribe the finished video.

## Step 1: write for the ear

A voiceover script is read, not scanned, so write it differently from copy:

- **150 to 165 words is about 60 seconds.** Count words before you voice anything.
- **One sentence per line.** In NodeTool's script editor a line is the unit that gets a take and times a shot. A paragraph in one line is a shot you cannot cut.
- **Spell out what the voice must say.** Write "twenty-four ninety-nine" if that is how the price should sound. Write "N-O-D-E" if the model should spell a word.
- **Put the emphasis in the words.** Short sentences land harder than bold text, which the model cannot see.

## Step 2: pick a voice

| Model | Provider | USD per million characters | 60 s script (~900 characters) |
| :--- | :--- | ---: | ---: |
| Kokoro 82M | Together AI | 4 | $0.004 |
| Kokoro | fal | 20 | $0.018 |
| Chatterbox | fal, Replicate | 25 | $0.023 |
| ElevenLabs Flash v2.5 / Turbo v2.5 | ElevenLabs, fal | 50 | $0.045 |
| Gemini 3.1 Flash TTS | fal | 50 | $0.045 |
| Qwen3 TTS | fal | 90 | $0.081 |
| ElevenLabs Multilingual v2 / v3 | ElevenLabs, fal | 100 | $0.09 |
| MiniMax Speech 02 HD | fal | 100 | $0.09 |

Two things stand out.

**Voices are cheap enough to audition properly.** Ten full takes of a 60-second script in ElevenLabs v3 cost ninety cents. Pick the voice by listening to your script, not a demo sentence.

**Local is free after the download.** Kokoro also runs in NodeTool through the `transformers.TextToSpeech` node on your own machine, with no key and no per-character cost. It is English only in the current build.

The generic **Text To Speech** node (`nodetool.audio.TextToSpeech`) has a model picker across every voice your keys reach, so you can swap ElevenLabs for Gemini without touching the graph. Provider nodes such as `elevenlabs.TextToSpeech`, `gemini.audio.TextToSpeech`, `minimax.TextToSpeech` and `openai.audio.TextToSpeech` expose each provider's own options. See [text to speech](/tasks/text-to-speech) for the full list, and [ElevenLabs](/providers/elevenlabs) and [MiniMax](/providers/minimax) for their provider pages.

If the voice belongs to a recurring character, store it on the character. A character entity in NodeTool has a **Voice id** field, so every script that casts that character uses the same voice.

## Step 3: voice line by line

There are two ways to do this in NodeTool.

**In a graph.** String Input → Text To Speech → Normalize → Fade In → Fade Out → Output. The [Narrate a Script](/templates/narrate-a-script) template is the first two nodes of that chain, with ElevenLabs Multilingual v2 on fal. [Voice a Script in Two Voices](/templates/voice-a-script-in-two-voices) handles a dialogue.

**In a script document.** Add a speaker, give it a voice, write one line per sentence, and choose **Voice all**. Each line gets its own take, the editor shows what voicing will cost before you run it, and a changed line is marked stale so only that line is voiced again. Each take is transcribed for word timings, which become captions later.

The agent can do the whole thing: "Write a 60-second explainer about our new grinder, voice it with a warm male narrator, and make a timeline." It writes the script, sets the speaker's voice, voices the lines and assembles the cut.

## Step 4: cut the picture to the voice

When a storyboard is linked to a script, each shot takes its length from the takes of the lines it covers. Change a line, revoice it, and the shot gets longer or shorter to match. You never stretch audio to fit a picture.

Two details from the assembly step:

- **Mute the picture's own sound.** Generated clips often come with audio. Assembly puts it on a separate Shot Audio track, and you mute those clips so the narration carries.
- **Add music last, low.** Generate a bed and place it at a low volume under the voice. [Narration with a Music Bed](/templates/narration-with-a-music-bed) does the same mix in a graph.

For a single clip rather than a cut, the [Script to Narrated Clip](/templates/script-to-narrated-clip) template generates the voice and the video and joins them with Add Audio.

## Step 5: sync the face

Lip sync replaces the mouth movement in a video so it matches new audio. It needs a clip with a visible face, roughly facing the camera, and the final voiceover. Sync after the edit is locked.

| Model | Provider | USD |
| :--- | :--- | ---: |
| LatentSync | fal | 0.005 per second |
| Pixverse Lipsync | fal | 0.04 per second |
| Sync Lipsync v2 | fal | 3 per minute |
| Sync Lipsync v2 Pro | fal | 5 per minute |
| Sync Lipsync v3 | fal | 8 per minute |
| HeyGen v3 Precision | fal | 0.10 per second |
| Sync React-1 | fal | 10 per minute |

The generic **Lip Sync** node (`nodetool.video.LipSync`) takes `video` and `audio` and defaults to Sync Lipsync v2. The [Lip-sync a Clip to a Voice Track](/templates/lip-sync-a-clip-to-a-voice-track) template levels and fades the audio before the sync, and the [AI Spokesperson](/templates/ai-spokesperson) template adds the text-to-speech step in front. See [lip sync](/tasks/lip-sync) for more models.

**If you have no footage**, start from a photo with a talking-avatar model. These take an image and audio and return a speaking clip:

| Model | Provider | USD per second |
| :--- | :--- | ---: |
| HeyGen Avatar 4 | fal | 0.10 |
| Kling AI Avatar v2 Pro | fal | 0.115 |
| ByteDance OmniHuman | fal | 0.14 |
| OmniHuman 1.5 | fal | 0.16 |

On the timeline, the agent's `lip_sync` tool returns the synced clip as a candidate that you accept before it replaces anything. It syncs to an accepted voice: replace the voice, accept it, then sync.

## Step 6: caption from the take

Most social video is watched without sound, so captions are part of the voiceover job.

- **From a script.** The word timings from Step 3 become captions on the timeline, and the `nodetool.script.ScriptToSubtitles` node exports them as SRT or WebVTT. The [Localized Explainer](/templates/localized-explainer) template uses this path.
- **From a finished clip.** Transcribe with Whisper (`fal.speech_to_text.Whisper`) or another speech-to-text node, then burn the text in with **Add Subtitles** (`nodetool.video.AddSubtitles`), which sets font, alignment, size and colour. fal's Auto Caption does both in one call for $0.10 per video.

Captions from the script are exact. Captions from a transcription can mishear names and product terms, so read them before export.

## What a 60-second explainer costs

| Step | Plan | Cost |
| :--- | :--- | ---: |
| Voiceover | ElevenLabs v3, 5 full takes of ~900 characters | $0.45 |
| Presenter shots | 20 s of on-camera footage, Sync Lipsync v2 | $1.00 |
| Captions | From the script's word timings | $0.00 |
| **Total for voice, sync and captions** | | **$1.45** |

The picture is not in this table. See [what AI video costs](/blog/ai-video-generation-cost) for that. Sync only the shots where the face is on screen. B-roll under narration needs no lip sync at all.

## Checklist

1. Write for the ear: 150 to 165 words per minute, one sentence per line.
2. Audition voices on your script, not a demo line.
3. Store a character's voice on the character.
4. Voice before you cut, and let the takes set shot lengths.
5. Mute the picture's own sound under narration.
6. Lip sync only on-camera shots, after the edit is locked.
7. Caption from the script's timings, and read transcribed captions before export.

## FAQ

### What is the best AI voice for a voiceover?

ElevenLabs v3 and Multilingual v2 are common choices for narration at $100 per million characters, about nine cents for a 60-second script. Gemini 3.1 Flash TTS and ElevenLabs Flash cost half that. Kokoro costs $4 per million characters on Together AI and runs locally for free in English. Audition two or three on your own script.

### How do I lip sync an AI video?

Run the clip and the final audio through a lip-sync model such as Sync Lipsync, LatentSync or HeyGen Lipsync. In NodeTool, the Lip Sync node takes a video and an audio input and defaults to Sync Lipsync v2 at $3 per minute. Sync after the edit is final, because re-timing a synced shot breaks the sync.

### Can I make a talking avatar from a single photo?

Yes. Talking-avatar models such as OmniHuman 1.5, Kling AI Avatar v2 and HeyGen Avatar 4 take one image and an audio track and return a speaking clip. They cost between $0.10 and $0.16 per second on fal.

### Can I dub a video into another language?

Yes. Translate the script, voice it in the new language, and lip sync the on-camera shots to the new audio. The [Multilingual Video Dubber recipe](/recipes/multilingual-video-dubber) walks through English and Spanish voiceover and lip-sync versions of one presenter clip. The [Localise a Script and Revoice It](/templates/localise-a-script-and-revoice-it) template does the translate-and-voice half in one graph.

### Can I clone a real person's voice?

Voice-cloning models exist, including MiniMax Voice Clone, but use them only with the speaker's consent and within the provider's terms. Label synthetic speech where you publish it.

## Read next

- [AI Spokesperson template](/templates/ai-spokesperson) — Script to synced presenter clip in one graph.
- [Lip sync](/tasks/lip-sync) — Every lip-sync model you can wire in.
- [Multilingual Video Dubber recipe](/recipes/multilingual-video-dubber) — One video, several languages.
- [Text to speech](/tasks/text-to-speech) — Voices, prices and local options.
