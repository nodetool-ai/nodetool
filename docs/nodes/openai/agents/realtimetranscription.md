---
layout: page
title: "Realtime Transcription"
node_type: "openai.agents.RealtimeTranscription"
namespace: "openai.agents"
---

**Type:** `openai.agents.RealtimeTranscription`

**Namespace:** `openai.agents`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `enum` | The realtime model to use. | `gpt-4o-mini-realtime-preview` |
| chunk | `chunk` | Audio chunk input stream (base64-encoded PCM16 audio). | `{"type":"chunk","node_id":null,"thread_id":null...` |
| system | `str` | System instructions (optional) | `` |
| temperature | `float` | Decoding temperature | `0.8` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| chunk | `chunk` |  |

## Related Nodes

Browse other nodes in the [openai.agents](../) namespace.
