---
layout: page
title: "Realtime Agent"
node_type: "openai.agents.RealtimeAgent"
namespace: "openai.agents"
---

**Type:** `openai.agents.RealtimeAgent`

**Namespace:** `openai.agents`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `enum` |  | `gpt-4o-mini-realtime-preview` |
| system | `str` | System instructions for the realtime session | - |
| chunk | `chunk` | The audio chunk to use as input. | `{"type":"chunk","node_id":null,"thread_id":null...` |
| voice | `enum` | The voice for the audio output | `alloy` |
| speed | `float` | The speed of the model’s spoken response | `1` |
| temperature | `float` | The temperature for the response | `0.8` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |
| audio | `audio` |  |
| text | `str` |  |

## Related Nodes

Browse other nodes in the [openai.agents](../) namespace.
