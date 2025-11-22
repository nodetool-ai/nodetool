---
layout: page
title: "Realtime Transcription"
node_type: "openai.agents.RealtimeTranscription"
namespace: "openai.agents"
---

**Type:** `openai.agents.RealtimeTranscription`

**Namespace:** `openai.agents`

## Description

Stream microphone or audio input to OpenAI Realtime and emit transcription.

    Emits:
      - `chunk` Chunk(content=..., done=False) for transcript deltas
      - `chunk` Chunk(content="", done=True) to mark segment end
      - `text` final aggregated transcript when input ends

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `language_model` | Model to use | `{'type': 'language_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| system | `str` | System instructions (optional) | `` |
| temperature | `float` | Decoding temperature | `0.8` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| chunk | `chunk` |  |

## Metadata

## Related Nodes

Browse other nodes in the [openai.agents](../) namespace.

