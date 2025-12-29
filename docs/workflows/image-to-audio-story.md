---
layout: page
title: "Image To Audio Story"
---

## What You'll Create

Transform images into narrated stories using AI vision and text-to-speech. Good for content creators, educators, and storytellers who want to add audio descriptions to images.

**Time to complete:** 5 minutes  
**Difficulty:** Intermediate

---

## Overview

Turn visual content into narrated stories by combining vision AI with language generation and speech synthesis.

**How it works:**
1. **Image Input** - Your photo, artwork, or any visual
2. **AI Vision + Story Generation** - AI analyzes the image and writes a story
3. **Text Output** - Generated description or narrative
4. **Text-to-Speech** - Converts text to spoken audio
5. **Audio Output** - Narration you can save or share

---

## The Process

### Vision Analysis
AI analyzes your image to understand:
- Visual elements and composition
- Emotions and mood
- Themes and symbolism
- Story potential

### Story Generation
AI writes a narrative inspired by the image. Can create:
- Descriptive captions
- Emotional narratives
- Poetic descriptions
- Character backstories

### Audio Narration
Text-to-speech converts the story to audio with:
- Natural intonation
- Multiple voice options
- Adjustable speed

---

## Customization Ideas

**Prompt examples:**
- "Describe this image as if you're a museum curator"
- "Write a short poem inspired by this artwork"
- "Create a brief backstory for this scene"
- "Explain what you see in simple, accessible language"

**Vision models:**
- OpenAI: GPT-4o (vision + text generation)
- Anthropic: Claude 3 (Opus, Sonnet, Haiku)
- Local: LLaVA, Qwen-VL via Ollama
- Google: Gemini Pro Vision

**TTS options:**
- OpenAI TTS (multiple voices)
- ElevenLabs (customizable)
- Local TTS (Coqui, Bark)

---

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
2. Load your image (artwork, photos, or any visual content)
3. Customize the AI prompt in the Agent node:
   - Default: "Create a story inspired by this image"
   - Or try: "Write like a museum curator", "Create a children's story"
4. Choose your voice in the TextToSpeech node
5. Press <kbd>Ctrl/⌘ + Enter</kbd> to run
6. View the written story and hear the narration
7. Export audio or copy text as needed

**Tips:**
- Try the same image with different prompts for varied results
- Use multiple images to create series or episodes
- Combine with video workflows for multimedia content

---

## Related Workflows

- [Story to Video Generator](story-to-video-generator.md) - Turn stories into videos
- [Movie Posters](movie-posters.md) - Create visual content
- [Creative Story Ideas](creative-story-ideas.md) - Generate story concepts

Browse all [workflows](/workflows/) for more examples.
