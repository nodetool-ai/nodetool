---
layout: page
title: "Media Agent"
node_type: "nodetool.agents.MediaAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.MediaAgent`

**Namespace:** `nodetool.agents`

## Description

Prompt-driven media skill for model-based audio/video reasoning.
    skills, media, audio, video, agent

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for media prompts. | `{"type":"language_model","provider":"empty","id...` |
| audio | `audio` | Optional audio input for media reasoning tasks. | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| video | `video` | Optional video input for media reasoning tasks. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| prompt | `str` | Prompt for media task execution. | `` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `180` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `200000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| video | `video` |  |
| audio | `audio` |  |
| text | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
