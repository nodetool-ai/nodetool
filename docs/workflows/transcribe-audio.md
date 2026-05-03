---
layout: page
title: "Transcribe Audio"
---

## Overview

Convert speech to text using the Whisper model with word-level timestamps.

1. **Audio Input** - Record your voice or upload an audio file
2. **Automatic Speech Recognition** - Processes audio through Whisper
3. **String Output** - Displays the transcribed text

## How to Use

- Record your voice or upload a file using the audio input
- Click Run
- Read the transcription in the output

## Tags

start, audio, huggingface

## Workflow Diagram

{% mermaid %}
graph TD
  audio_7["audio"]
  transciption_8["transciption"]
  automaticspeechrecognition_c51917["AutomaticSpeechRecognition"]
  audio_7 --> automaticspeechrecognition_c51917
  automaticspeechrecognition_c51917 --> transciption_8
{% endmermaid %}
