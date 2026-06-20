---
layout: page
title: "SVGGenerator"
node_type: "nodetool.generators.SVGGenerator"
namespace: "nodetool.generators"
---

**Type:** `nodetool.generators.SVGGenerator`

**Namespace:** `nodetool.generators`

## Description

LLM Agent to create SVG elements based on user prompts.
    svg, generator, vector, graphics

    Use cases:
    - Creating vector graphics from text descriptions
    - Generating scalable illustrations
    - Creating custom icons and diagrams

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | The language model to use for SVG generation. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | The user prompt for SVG generation | `` |
| image | `list[image]` | Images to use for generation. Accepts a list, or a single Image (auto-wrapped). Each becomes a separate block in the message sent to the provider. | `[]` |
| audio | `list[audio]` | Audio to use for generation. Accepts a list, or a single Audio (auto-wrapped). Each becomes a separate block in the message sent to the provider. | `[]` |
| max_tokens | `int` | The maximum number of tokens to generate. | `8192` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[svg_element]` |  |

## Related Nodes

Browse other nodes in the [nodetool.generators](./) namespace.
