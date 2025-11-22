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
| model | `any` | The language model to use for SVG generation. | `{'type': 'language_model', 'provider': 'empty', 'id': '', 'name': '', 'path': None, 'supported_tasks': []}` |
| prompt | `any` | The user prompt for SVG generation | `` |
| image | `any` | Image to use for generation | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| audio | `any` | Audio to use for generation | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| max_tokens | `any` | The maximum number of tokens to generate. | `8192` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.generators](../) namespace.

