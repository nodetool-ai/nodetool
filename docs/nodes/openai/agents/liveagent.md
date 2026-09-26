---
layout: page
title: "Live Agent"
node_type: "openai.agents.LiveAgent"
namespace: "openai.agents"
---

**Type:** `openai.agents.LiveAgent`

**Namespace:** `openai.agents`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `enum` |  | `gpt-live-1` |
| instructions | `str` | Conversation instructions for the voice model: style, and when to delegate to the backend | `Be concise. Delegate requests needing current i...` |
| chunk | `chunk` | Streaming input. Audio chunks are base64 mono PCM16 at 24 kHz. Text chunks are queued for the backend as user messages. | `{"type":"chunk","node_id":null,"thread_id":null...` |
| voice | `enum` | The voice for spoken output. Fixed for the session. | `marin` |
| backend_model | `str` | Responses model that handles delegated reasoning and tools | `gpt-5.6-luna` |
| backend_instructions | `str` | Prompt for the backend model: task rules and how to return results | `` |
| web_search | `bool` | Let the backend model search the web | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `chunk` |  |
| audio | `audio` |  |
| text | `str` |  |
| input_transcript | `str` |  |

## Related Nodes

Browse other nodes in the [openai.agents](./) namespace.
