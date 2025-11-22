---
layout: page
title: "Transcribe Audio"
---

## Overview

Convert speech to text using Whisper model with word-level timestamps

Convert speech to text using the Whisper model with word-level timestamps.

1. **Audio Input** - Record your voice or upload an audio file

2. **Automatic Speech Recognition** - Processes the audio through Whisper model to generate transcription

3. **String Output** - Displays the transcribed text

## How to Use:

- Record your voice using the audio input

- Hit the run button

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

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
