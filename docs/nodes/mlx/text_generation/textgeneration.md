---
layout: page
title: "MLX Text Generation"
node_type: "mlx.text_generation.TextGeneration"
namespace: "mlx.text_generation"
---

**Type:** `mlx.text_generation.TextGeneration`

**Namespace:** `mlx.text_generation`

## Description

Generate text using locally cached MLX models on Apple Silicon.
    text, generation, mlx, local-llm

    Use cases:
    - Fast local iteration with MLX-converted instruction models
    - Privacy-preserving summarization, drafting, or Q&A
    - Building multi-node agent workflows without external APIs

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `language_model` | MLX language model to use for generation. The model must be available in the local Hugging Face cache. | `{'type': 'language_model', 'provider': 'mlx', 'id': 'mlx-community/Llama-3.2-3B-Instruct-4bit', 'name': 'Llama-3.2-3B Instruct (4-bit)', 'path': None, 'supported_tasks': []}` |
| system_prompt | `str` | Optional system prompt used to steer the model. | `You are a helpful assistant.` |
| prompt | `str` | The user prompt used for generation. | `` |
| max_new_tokens | `int` | Maximum number of tokens the model should generate. | `256` |
| temperature | `float` | Sampling temperature. Set to 0 for deterministic output. | `0.7` |
| top_p | `float` | Nucleus sampling probability mass. | `0.95` |
| top_k | `int` | Limits sampling to the top K tokens at each step. | `50` |
| min_p | `float` | Minimum token probability threshold (0 disables). | `0.0` |
| min_tokens_to_keep | `int` | Ensures at least this many tokens remain after filtering. | `1` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| chunk | `chunk` |  |

## Metadata

## Related Nodes

Browse other nodes in the [mlx.text_generation](../) namespace.

