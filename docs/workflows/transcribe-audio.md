---
layout: page
title: "Transcribe Audio"
---

## Overview

Convert speech to text with Whisper. The workflow returns plain text, with no timestamps.

1. **Audio Input** (`nodetool.input.AudioInput`) - Record your voice or upload an audio file
2. **Automatic Speech Recognition** (`nodetool.text.AutomaticSpeechRecognition`) - Transcribes the audio. The template selects `openai/whisper-large-v3` on fal.ai. The node also takes a language code (empty detects it), a guiding prompt, and a temperature.
3. **Output** - The `transcript` text

For timed segments or words, use `openai.audio.Transcribe`, which returns `text`, `segments`, and `words`.

## Demo

<video controls preload="metadata" poster="{{ '/assets/workflows/transcribe-audio.jpg' | relative_url }}">
  <source src="{{ '/assets/workflows/transcribe-audio.mp4' | relative_url }}" type="video/mp4">
</video>

## How to Use

- Record your voice or upload a file using the audio input
- Click Run
- Read the transcript in the output

## Tags

start, audio, asr

## Workflow Diagram

{% mermaid %}
graph TD
  audio["AudioInput (audio)"]
  asr["AutomaticSpeechRecognition"]
  transcript["Output (transcript)"]
  audio --> asr
  asr -->|text| transcript
{% endmermaid %}
