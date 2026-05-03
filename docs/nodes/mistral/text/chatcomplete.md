---
layout: page
title: "Chat Complete"
node_type: "mistral.text.ChatComplete"
namespace: "mistral.text"
---

**Type:** `mistral.text.ChatComplete`

**Namespace:** `mistral.text`

## Description

Generate text using Mistral AI's chat completion models.
    mistral, chat, ai, text generation, llm, completion

    Uses Mistral AI's chat models to generate responses from prompts.
    Requires a Mistral API key.

    Use cases:
    - Generate text responses to prompts
    - Build conversational AI applications
    - Code generation with Codestral
    - Multi-modal understanding with Pixtral

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `enum` | The Mistral model to use for generation | `mistral-small-latest` |
| prompt | `str` | The prompt for text generation | `` |
| system_prompt | `str` | Optional system prompt to guide the model's behavior | `` |
| temperature | `float` | Sampling temperature. Higher values make output more random. | `0.7` |
| max_tokens | `int` | Maximum number of tokens to generate | `1024` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [mistral.text](../) namespace.
