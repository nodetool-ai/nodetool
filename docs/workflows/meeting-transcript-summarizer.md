---
layout: page
title: "Meeting Transcript Summarizer"
---

## Overview

Summarizes a meeting from a recording or from a pasted transcript, and returns action items as table rows instead of prose.

1. **Inputs** - `Recording` (`nodetool.input.AudioInput`) and `Transcript` (`nodetool.input.StringInput`, multiline). Fill in either one. The template ships with a sample recording, so clear it when you paste a transcript.
2. **Routing** - A `Code` node tests whether the pasted transcript is empty. Two `If` nodes pick the transcribed audio when it is empty and the pasted text otherwise. A second `Code` node joins the chosen text.
3. **Transcription** (`nodetool.text.AutomaticSpeechRecognition`) - Transcribes the recording with `openai/whisper-large-v3` on fal.ai.
4. **Summary** (`nodetool.agents.Summarizer`) - Writes a Markdown summary of about 150 words with Overview, Key discussion points, and Open questions.
5. **Action items** (`nodetool.text.Prompt` into `nodetool.generators.DataGenerator`) - Returns a table with `action`, `owner`, and `due_date` columns.
6. **Outputs** - `Transcript`, `Summary`, and `Action Items`.

## Demo

<video controls preload="metadata" poster="{{ '/assets/workflows/meeting-transcript-summarizer.jpg' | relative_url }}">
  <source src="{{ '/assets/workflows/meeting-transcript-summarizer.mp4' | relative_url }}" type="video/mp4">
</video>

## Tags

audio, llm, dataframe

## Workflow Diagram

{% mermaid %}
graph TD
  recording["AudioInput (Recording)"]
  pasted["StringInput (Transcript)"]
  asr["AutomaticSpeechRecognition"]
  empty["Code (is empty)"]
  useAudio["If (use transcribed audio)"]
  usePasted["If (use pasted transcript)"]
  join["Code (join)"]
  summarizer["Summarizer"]
  prompt["Prompt (action items)"]
  generator["DataGenerator"]
  transcriptOut["Output (Transcript)"]
  summaryOut["Output (Summary)"]
  actionsOut["Output (Action Items)"]
  recording --> asr
  pasted --> empty
  empty --> useAudio
  empty --> usePasted
  asr --> useAudio
  pasted --> usePasted
  useAudio --> join
  usePasted --> join
  join --> summarizer --> summaryOut
  join --> prompt --> generator --> actionsOut
  join --> transcriptOut
{% endmermaid %}
