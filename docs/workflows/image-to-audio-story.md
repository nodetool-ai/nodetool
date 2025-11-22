---
layout: page
title: "Image To Audio Story"
---

## Overview

Generate and narrate creative stories from images using AI

Transforms visual art into narrative storytelling and spoken word using multimodal AI.

## 📋 Pipeline Flow:

1. Image Input: Any image (artwork, photo, scene, object)

2. Story Generation: Vision-capable LLM analyzes the image and creates a creative short story based on visual elements, emotions, and artistic themes

3. Text Output: Literary description capturing the essence and narrative of the image

4. Audio Narration: Text-to-speech converts the story into spoken word audio

## 💡 Key Features:

Multimodal AI: Combines vision (image analysis) and language (story generation)Creative interpretation: Goes beyond description to generate original narrativesDual outputs: Both text story and audio narrationModel flexibility: Works with any vision-capable LLM and TTS service

## ⚙️ Customization:

Agent prompts to try:

"Describe this image as if you're a museum curator""Write a poem inspired by this image""Create a backstory for what's happening in this scene""Explain the emotions and symbolism in this artwork""Tell a children's story based on this picture"

Vision model options:

OpenAI: GPT-4oAnthropic: Claude 3 (Opus, Sonnet, Haiku)Local: LLaVA, Qwen-VL via OllamaGoogle: Gemini Pro Vision

TTS provider options:

OpenAI TTS (multiple voices and speeds)ElevenLabs (high-quality, customizable voices)Local TTS models via Coqui or Bark

## 🎯 Use Cases:

Art interpretation and educationAccessibility (converting visual content to audio)Creative writing inspirationStorytelling for children's booksSocial media content generationVisual art documentationMuseum audio guides

## Tags

start, multimodal

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

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
