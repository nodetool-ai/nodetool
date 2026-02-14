---
layout: page
title: "Mindblowing Video Pipeline"
---

## Overview

This workflow turns a single idea into a cinematic short video with:

1. a high-impact creative concept,
2. scene-by-scene prompt generation,
3. AI video generation for each scene,
4. a narrated voiceover script.

Use it when you want trailer-like output for social posts, product reveals, speculative fiction, or pitch videos.

## Pipeline Goals

- Build a **30–45 second visual arc** from one input idea
- Keep style, pacing, and mood consistent across scenes
- Generate both **visual output** and a **voiceover script** in one run
- Preserve a reusable prompt “bible” so outputs can be iterated quickly

## NodeTool Workflow Structure

### 1) Inputs

- **StringInput (Core Idea)**: One-line concept, e.g. _"A city that wakes up when one child starts drawing in the sky."_
- **StringInput (Visual Style)**: e.g. _"Hyperreal cinematic, anamorphic lens flares, soft haze, volumetric light."_
- **StringInput (Audience + Platform)**: e.g. _"TikTok + YouTube Shorts, creators 18–34, fast pacing."_

### 2) Prompt Strategy Layer

- **FormatText (Creative Brief Composer)** combines all inputs into one structured brief.
- **Agent (Director Agent)** outputs:
  - hook concept,
  - 4-scene beat sheet,
  - camera language,
  - color/mood progression,
  - continuity constraints.

### 3) Shot Prompt Expansion

- **ListGenerator (Shot Prompt Builder)** expands the beat sheet into one rich text-to-video prompt per scene.
- **Preview** node attached here helps validate prompts before generation.

### 4) Video Generation

- **TextToVideo (Scene 1)**
- **TextToVideo (Scene 2)**
- **TextToVideo (Scene 3)**
- **TextToVideo (Scene 4)**

Each node gets one scene prompt and can share common settings (aspect ratio, resolution, seed strategy).

### 5) Narration Layer

- **Agent (Voiceover Writer)** takes the same beat sheet and writes a 70–100 word dramatic narration.
- **TextToSpeech** converts narration into voice audio.
- **Preview** for quick QA.

### 6) Output Layer

- **Preview (Videos)** for scene-by-scene visual review
- **Output (Prompt Bible + Voiceover + Scene Clips)** for export and downstream editing

## Mermaid Diagram

{% mermaid %}
graph TD
  core_idea["StringInput: Core Idea"]
  style["StringInput: Visual Style"]
  audience["StringInput: Audience + Platform"]
  brief["FormatText: Creative Brief Composer"]
  director["Agent: Director Agent"]
  shot_list["ListGenerator: Shot Prompt Builder"]
  prompt_preview["Preview: Prompt QA"]

  scene1["TextToVideo: Scene 1"]
  scene2["TextToVideo: Scene 2"]
  scene3["TextToVideo: Scene 3"]
  scene4["TextToVideo: Scene 4"]

  vo_agent["Agent: Voiceover Writer"]
  tts["TextToSpeech"]
  voice_preview["Preview: Voice QA"]

  output["Output: Final Package"]

  core_idea --> brief
  style --> brief
  audience --> brief
  brief --> director
  director --> shot_list
  shot_list --> prompt_preview

  shot_list --> scene1
  shot_list --> scene2
  shot_list --> scene3
  shot_list --> scene4

  director --> vo_agent
  vo_agent --> tts
  tts --> voice_preview

  scene1 --> output
  scene2 --> output
  scene3 --> output
  scene4 --> output
  tts --> output
  director --> output
{% endmermaid %}

## Video Script Example (45 seconds)

### Concept

**Input idea:** _"The internet goes dark for one minute, revealing a hidden layer of reality."_

### Hook (0:00–0:05)

**Visual:** City lights flicker; every screen glitches to black.

**Voiceover:**
> At midnight, the network blinked… and the world finally showed its second face.

### Scene 1 (0:05–0:15) — Discovery

**Visual prompt:**
> Cinematic night city, mass phone screens black, holographic glyphs emerging in air, pedestrians frozen in confusion, low-angle dolly push, electric cyan and violet palette, mist, dramatic contrast, ultra-detailed, 24fps film look.

**Voiceover:**
> Signals vanished. Noise collapsed. In the silence, patterns rose like constellations made of code.

### Scene 2 (0:15–0:25) — Escalation

**Visual prompt:**
> Rooftop chase through rain, digital symbols projecting from puddles, handheld camera energy, whip pans, intense backlight, reflective asphalt, atmospheric particles, high motion clarity.

**Voiceover:**
> Streets became maps. Shadows became instructions. And every step unlocked a door no one knew existed.

### Scene 3 (0:25–0:35) — Revelation

**Visual prompt:**
> Underground chamber beneath city, colossal rotating data monolith, human silhouette dwarfed by scale, slow orbit camera, golden dust beams piercing darkness, awe-inspiring composition.

**Voiceover:**
> Beneath the city, beneath the signal, a memory machine waited—older than our networks, older than our names.

### Scene 4 (0:35–0:45) — Payoff

**Visual prompt:**
> Sunrise over skyline transformed by translucent geometric structures, calm crane pullback, warm amber + soft teal grade, hopeful epic tone, cinematic ending frame.

**Voiceover:**
> The minute returned. The internet came back. But reality never fully switched off again.

## Reusable Prompt Template for Director Agent

Use this in your **FormatText** node:

```text
You are a cinematic AI director.

Create a 4-scene short-form video plan from this idea:
- Core Idea: {core_idea}
- Visual Style: {visual_style}
- Audience/Platform: {audience}

Requirements:
1) Output a 1-line hook.
2) Output 4 scenes with:
   - purpose,
   - camera movement,
   - lighting,
   - color palette,
   - emotional tone,
   - continuity links between scenes.
3) Keep scenes suitable for 7-10 seconds each.
4) Make the concept feel novel, high-energy, and coherent.
```

## Production Tips

- Keep a stable color motif across all scene prompts for cohesion.
- Reuse key nouns (objects, symbols, locations) to improve continuity.
- Use a deterministic seed while iterating style; randomize only for final exploration.
- Attach Preview nodes to both prompt text and generated scenes to catch drift early.

## Related Workflows

- [Story to Video Generator](story-to-video-generator.md)
- [Movie Posters](movie-posters.md)
- [Image To Audio Story](image-to-audio-story.md)
