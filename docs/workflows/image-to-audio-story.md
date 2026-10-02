---
layout: page
title: "Image To Audio Story"
---

## Overview

Turns an image into a narrated story. A vision agent writes the story and a text-to-speech model reads it aloud.

**How it works:**
1. **Image Input** (`nodetool.input.ImageInput`, named `image`) - Your photo, artwork, or any visual
2. **Agent** (`nodetool.agents.Agent`) - Receives the image on its `image` input and writes a 150 to 250 word story with a title line. The template selects `gpt-5-mini`.
3. **Text-to-Speech** (`nodetool.audio.TextToSpeech`) - Reads the agent's `text` output. The template selects OpenAI `tts-1` with the `alloy` voice.
4. **Output** - The `narration` audio you can save or share

**Prompt examples:**
- "Describe this image as if you're a museum curator"
- "Write a short poem inspired by this artwork"
- "Create a brief backstory for this scene"

## Demo

<video controls preload="metadata" poster="{{ '/assets/cookbook/image-to-story.jpg' | relative_url }}">
  <source src="{{ '/assets/cookbook/image-to-story.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

start, multimodal, example

## Workflow Diagram

{% mermaid %}
graph TD
  image["ImageInput (image)"]
  agent["Agent"]
  tts["TextToSpeech"]
  narration["Output (narration)"]
  image --> agent
  agent -->|text| tts
  tts -->|audio| narration
{% endmermaid %}

## How to Use

1. Open NodeTool, click **Examples** in the app menu, and load "Image To Audio Story"
2. Load your image
3. Edit the prompt in the Agent node (the default asks for a short story with a beginning, middle, and end)
4. Choose your voice in the TextToSpeech node
5. Press <kbd>Ctrl/⌘ + Enter</kbd> to run

## Related Workflows

- [Movie Posters](movie-posters.md) - Create visual content
- [Creative Story Ideas](creative-story-ideas.md) - Generate story concepts
