---
layout: page
title: "Meeting Transcript Summarizer"
---

## Overview

Automatically transcribe a meeting recording and generate concise notes.

📄 **Meeting Transcript Summarizer**

This workflow converts a meeting recording into concise notes.

1.	**Audio Input: **Load a meeting recording.

2.	**Transcription: **Speech is transcribed with OpenAI Whisper.

3.	**Summarization: **The transcript is condensed into key points.

4.	**Output: **A text node displays the final summary.

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

## How to Use

1. Open NodeTool and create a new workflow
2. Import this workflow from the examples gallery or build it manually following the diagram above
3. Configure the input nodes with your data
4. Run the workflow to see results

## Related Workflows

Browse other [workflow examples](/cookbook.md) to discover more capabilities.
