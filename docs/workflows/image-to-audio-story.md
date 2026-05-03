---
layout: page
title: "Image To Audio Story"
---

## Overview

Transforms images into narrated stories by combining vision AI with language generation and speech synthesis.

**How it works:**
1. **Image Input** - Your photo, artwork, or any visual
2. **AI Vision + Story** - AI analyzes the image and writes a narrative
3. **Text-to-Speech** - Converts the story to spoken audio
4. **Audio Output** - Narration you can save or share

**Prompt examples:**
- "Describe this image as if you're a museum curator"
- "Write a short poem inspired by this artwork"
- "Create a brief backstory for this scene"

## Tags

start, multimodal, creative, audio, storytelling

## Workflow Diagram

{% mermaid %}
graph TD
  image_1["Image"]
  agent_77a9cf["Agent"]
  texttospeech_ffb9de["TextToSpeech"]
  image_1 --> agent_77a9cf
  agent_77a9cf --> texttospeech_ffb9de
{% endmermaid %}

## How to Use

1. Open NodeTool and find "Image to Audio Story" template
2. Load your image
3. Customize the AI prompt in the Agent node (default: "Create a story inspired by this image")
4. Choose your voice in the TextToSpeech node
5. Press <kbd>Ctrl/⌘ + Enter</kbd> to run

## Related Workflows

- [Story to Video Generator](story-to-video-generator.md) - Turn stories into videos
- [Movie Posters](movie-posters.md) - Create visual content
- [Creative Story Ideas](creative-story-ideas.md) - Generate story concepts
