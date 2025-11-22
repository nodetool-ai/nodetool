---
layout: page
title: "Text Generation"
node_type: "huggingface.text_generation.TextGeneration"
namespace: "huggingface.text_generation"
---

**Type:** `huggingface.text_generation.TextGeneration`

**Namespace:** `huggingface.text_generation`

## Description

Generates text based on a given prompt.
    text, generation, natural language processing

    Use cases:
    - Creative writing assistance
    - Automated content generation
    - Chatbots and conversational AI
    - Code generation and completion

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model ID to use for the text generation. Supports both regular models and GGUF quantized models (detected by .gguf file extension). | `{'type': 'hf.text_generation', 'repo_id': '', 'path': None, 'variant': None, 'allow_patterns': None, 'ignore_patterns': None}` |
| prompt | `any` | The input text prompt for generation | `` |
| max_new_tokens | `any` | The maximum number of new tokens to generate | `50` |
| temperature | `any` | Controls randomness in generation. Lower values make it more deterministic. | `1.0` |
| top_p | `any` | Controls diversity of generated text. Lower values make it more focused. | `1.0` |
| do_sample | `any` | Whether to use sampling or greedy decoding | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `any` |  |
| chunk | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [huggingface.text_generation](../) namespace.

