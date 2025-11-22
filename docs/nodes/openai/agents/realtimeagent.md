---
layout: page
title: "Realtime Agent"
node_type: "openai.agents.RealtimeAgent"
namespace: "openai.agents"
---

**Type:** `openai.agents.RealtimeAgent`

**Namespace:** `openai.agents`

## Description

Stream responses using the official OpenAI Realtime client. Supports optional audio input and streams text chunks.
    realtime, streaming, openai, audio-input, text-output

    Uses `AsyncOpenAI().beta.realtime.connect(...)` with the events API:
    - Sends session settings via `session.update`
    - Adds user input via `conversation.item.create`
    - Streams back `response.text.delta` events until `response.done`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` |  | `gpt-4o-mini-realtime-preview` |
| system | `any` | System instructions for the realtime session | `
You are an AI assistant interacting in real-time. Follow these rules unless explicitly overridden by the user:

1. Respond promptly — minimize delay. If you do not yet have a complete answer, acknowledge the question and indicate what you are doing to find the answer.
2. Maintain correctness. Always aim for accuracy; if you’re uncertain, say so and optionally offer to verify.
3. Be concise but clear. Prioritize key information first, then supporting details if helpful.
4. Ask clarifying questions when needed. If the user’s request is ambiguous, request clarification rather than guessing.
5. Be consistent in terminology and definitions. Once you adopt a term or abbreviation, use it consistently in this conversation.
6. Respect politeness and neutrality. Do not use emotive language unless the conversation tone demands it.
7. Stay within safe and ethical bounds. Avoid disallowed content; follow OpenAI policies.
8. Adapt to the user’s style and level. If the user seems technical, use technical detail; if non-technical, explain with simpler language.
---
You are now active. Await the user’s request.
` |
| chunk | `any` | The audio chunk to use as input. | `{'type': 'chunk', 'node_id': None, 'content_type': 'text', 'content': '', 'content_metadata': {}, 'done': False}` |
| voice | `any` | The voice for the audio output | `alloy` |
| speed | `any` | The speed of the model's spoken response | `1.0` |
| temperature | `any` | The temperature for the response | `0.8` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| chunk | `any` |  |
| audio | `any` |  |
| text | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [openai.agents](../) namespace.

