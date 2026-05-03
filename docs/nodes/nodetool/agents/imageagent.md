---
layout: page
title: "Image Agent"
node_type: "nodetool.agents.ImageAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.ImageAgent`

**Namespace:** `nodetool.agents`

## Description

Prompt-driven image skill for model-based image reasoning.
    skills, image, agent, transform, extraction

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for image prompts. | `{"type":"language_model","provider":"empty","id...` |
| image | `image` | Optional image input for image reasoning tasks. | `{"type":"image","uri":"","asset_id":null,"data"...` |
| prompt | `str` | Prompt describing the image task. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `90` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `120000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| image | `image` |  |
| text | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
