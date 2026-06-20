---
layout: page
title: "Chat Complete"
node_type: "xai.text.ChatComplete"
namespace: "xai.text"
---

**Type:** `xai.text.ChatComplete`

**Namespace:** `xai.text`

## Description

Generate text using xAI's Grok chat completion models.
    xai, grok, chat, ai, text generation, llm, completion

    Uses xAI's Grok models to generate responses from prompts via the
    OpenAI-compatible chat completions endpoint. Requires an xAI API key.

    Use cases:
    - Generate text responses to prompts
    - Build conversational AI applications
    - Summarize, rewrite, and classify text
    - Reasoning tasks with Grok models

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | The Grok model to use (e.g. grok-4, grok-4.3, grok-3, grok-3-mini). | `grok-4` |
| prompt | `str` | The prompt for text generation | `` |
| system_prompt | `str` | Optional system prompt to guide the model's behavior | `` |
| temperature | `float` | Sampling temperature. Higher values make output more random. | `0.7` |
| max_tokens | `int` | Maximum number of tokens to generate | `1024` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [xai.text](./) namespace.
