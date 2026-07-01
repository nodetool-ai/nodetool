---
layout: page
title: "Meeting Transcript Summarizer"
---

## Overview

Transcribes a meeting recording with OpenAI Whisper, then condenses the transcript into concise notes.

1. **Audio Input** - Load a meeting recording.
2. **Transcription** - Speech is transcribed with Whisper.
3. **Summarization** - Transcript is condensed into key points.
4. **Output** - A text node displays the final summary.

## Demo

<video controls preload="metadata" poster="{{ '/assets/workflows/meeting-transcript-summarizer.jpg' | relative_url }}">
  <source src="{{ '/assets/workflows/meeting-transcript-summarizer.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

audio, llm

## Workflow Diagram

{% mermaid %}
graph TD
  audio_1["Audio"]
  summarizer_3["Summarizer"]
  summary_4["summary"]
  automaticspeechrecognition_a2e093["AutomaticSpeechRecognition"]
  automaticspeechrecognition_a2e093 --> summarizer_3
  audio_1 --> automaticspeechrecognition_a2e093
  summarizer_3 --> summary_4
{% endmermaid %}
