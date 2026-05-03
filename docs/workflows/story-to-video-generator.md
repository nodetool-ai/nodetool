---
layout: page
title: "Story to Video Generator"
---

## Overview

Transform story ideas into AI-generated videos. An agent crafts detailed visual prompts optimized for video generation, then Gemini Veo renders the video.

## How It Works

1. **Story Theme** - Describe your scene or story idea
2. **FormatText** - Injects theme into the prompt template
3. **AI Agent** - Crafts a video prompt with camera movements, lighting, and composition details
4. **TextToVideo** - Gemini Veo generates your video

## Example Story Themes

**Nature & Landscapes:**
- "Time-lapse of cherry blossoms blooming at sunrise"
- "Underwater coral reef with rays of sunlight"

**Sci-Fi & Fantasy:**
- "A lone astronaut discovering ancient alien ruins on Mars"
- "Mystical forest with bioluminescent plants at midnight"

**Urban & Cinematic:**
- "New York City street at night in the rain, neon reflections"
- "Drone shot rising over Tokyo at golden hour"

## Tips

- Be specific: include setting, lighting, time of day
- Describe camera movements or subject motion
- Keep themes focused on a single scene; omit dialogue and sound effects

## Configuration Options

- **Aspect Ratio**: 16:9 (widescreen), 9:16 (vertical), 1:1 (square)
- **Resolution**: 720p (faster), 1080p (higher quality)
- **Seed**: fixed number for consistent results, -1 for random

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
