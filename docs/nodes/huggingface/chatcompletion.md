---
layout: page
title: "Chat Completion"
node_type: "huggingface.ChatCompletion"
namespace: "huggingface"
---

**Type:** `huggingface.ChatCompletion`

**Namespace:** `huggingface`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `str` | Conversational model repo id (e.g. meta-llama/Llama-3.1-8B-Instruct, Qwen/Qwen2.5-7B-Instruct, openai/gpt-oss-120b). | `meta-llama/Llama-3.1-8B-Instruct` |
| system | `str` | Optional system prompt setting the assistant's behavior. | `` |
| prompt | `str` | The user message to send to the model. | `Hello!` |
| max_tokens | `int` | Maximum number of tokens to generate. | `512` |
| temperature | `float` | Sampling temperature (0-2). Higher is more random. | `0.7` |
| top_p | `float` | Nucleus sampling probability mass (0-1). | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [huggingface](./) namespace.
