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
|----------|------|-------------|----------|
| model | `language_model` | The language model to use for SVG generation. | `{'type': 'language_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| prompt | `str` | The user prompt for SVG generation | `` |
| image | `image` | Image to use for generation | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| audio | `audio` | Audio to use for generation | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| max_tokens | `int` | The maximum number of tokens to generate. | `8192` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[svg_element]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.generators](../) namespace.

