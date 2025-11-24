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
| model | `language_model` | The model to use for string generation. | `{'type': 'language_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| prompt | `str` | The user prompt | `` |
| input_text | `str` | The input text to be analyzed by the agent. | `` |
| max_tokens | `int` | The maximum number of tokens to generate. | `4096` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| item | `str` |  |
| index | `int` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.generators](../) namespace.

