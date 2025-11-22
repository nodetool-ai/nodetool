---
layout: page
title: "Story to Video Generator"
---

## Overview

Transform story ideas into cinematic AI-generated videos. An agent crafts detailed visual prompts optimized for video generation, then creates the video using Gemini Veo.

Transform story ideas into professional cinematic videos using AI.

## How It Works

Enter Story Theme - Describe your scene or story ideaFormatText - Injects your theme into the prompt templateAI Agent - Crafts a cinematic video prompt with:

Camera movements & anglesLighting & color detailsAtmosphere & moodComposition & framing

TextToVideo - Gemini Veo generates your videoPreview - View the crafted prompt and final video

## Example Story Themes

Nature & Landscapes:

"Time-lapse of cherry blossoms blooming at sunrise""Underwater coral reef with rays of sunlight piercing through"

Sci-Fi & Fantasy:

"A lone astronaut discovering ancient alien ruins on Mars""Mystical forest with bioluminescent plants at midnight"

Urban & Cinematic:

"New York City street at night in the rain, neon reflections""Drone shot rising over Tokyo at golden hour"

## Tips for Best Results

✅ Be specific - Include details about setting, lighting, time of day

✅ Add motion - Describe camera movements or subject actions

✅ Set the mood - Mention atmosphere (peaceful, dramatic, mysterious)

✅ Keep it visual - Focus on what can be seen, not abstract concepts

❌ Avoid vague descriptions like "something beautiful"

❌ Don't include dialogue or sound effects

❌ Keep themes focused on a single moment/scene

## Configuration Options

Aspect Ratio: 16:9 (widescreen), 9:16 (vertical), 1:1 (square)Resolution: 720p (faster), 1080p (higher quality)Seed: Set to same number for consistent results, -1 for random

## Tags

video, generation, ai, storytelling, creative

## Workflow Diagram

{% mermaid %}
graph TD
  story_theme_story_["story_theme"]
  formattext_format["FormatText"]
  agent_prompt["Agent"]
  texttovideo_video_["TextToVideo"]
  generated_video_video_["generated_video"]
  folderpathinput_1ea43f["FolderPathInput"]
  story_theme_story_ --> formattext_format
  formattext_format --> agent_prompt
  agent_prompt --> texttovideo_video_
  texttovideo_video_ --> generated_video_video_
{% endmermaid %}

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
