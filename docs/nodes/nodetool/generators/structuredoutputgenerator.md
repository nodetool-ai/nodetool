---
layout: page
title: "Structured Output Generator"
node_type: "nodetool.generators.StructuredOutputGenerator"
namespace: "nodetool.generators"
---

**Type:** `nodetool.generators.StructuredOutputGenerator`

**Namespace:** `nodetool.generators`

## Description

Generate structured JSON objects from instructions using LLM providers.
    data-generation, structured-data, json, synthesis

    Specialized for creating structured information:
    - Generating JSON that follows dynamic schemas
    - Fabricating records from requirements and guidance
    - Simulating sample data for downstream workflows
    - Producing consistent structured outputs for testing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| system_prompt | `str` | The system prompt guiding JSON generation. | ` You are a structured data generator focused on...` |
| model | `language_model` | Model to use for structured generation. | `{"type":"language_model","provider":"empty","id...` |
| instructions | `str` | Detailed instructions for the structured output. | `` |
| context | `str` | Optional context to ground the generation. | `` |
| max_tokens | `int` | The maximum number of tokens to generate. | `4096` |
| image | `list[image]` | Optional images to include in the generation request. Accepts a list, or a single Image (auto-wrapped). Each becomes a separate block in the message sent to the provider. | `[]` |
| audio | `list[audio]` | Optional audio to include in the generation request. Accepts a list, or a single Audio (auto-wrapped). Each becomes a separate block in the message sent to the provider. | `[]` |

## Outputs

_(none)_

## Related Nodes

Browse other nodes in the [nodetool.generators](./) namespace.
