---
layout: page
title: "List Generator"
node_type: "nodetool.generators.ListGenerator"
namespace: "nodetool.generators"
---

**Type:** `nodetool.generators.ListGenerator`

**Namespace:** `nodetool.generators`

## Description

LLM Agent to create a stream of strings based on a user prompt.
    llm, text streaming

    Use cases:
    - Generating text from natural language descriptions
    - Streaming responses from an LLM

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| model | `any` | The model to use for string generation. | `{'type': 'language_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| prompt | `any` | The user prompt | `` |
| input_text | `any` | The input text to be analyzed by the agent. | `` |
| max_tokens | `any` | The maximum number of tokens to generate. | `4096` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| item | `any` |  |
| index | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.generators](../) namespace.

