---
layout: page
title: "FFmpeg Agent"
node_type: "nodetool.agents.FfmpegAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.FfmpegAgent`

**Namespace:** `nodetool.agents`

## Description

Prompt-driven FFmpeg skill for audio/video editing, conversion, and packaging.
    skills, ffmpeg, media, video, audio, transcode, remux

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for media prompts. | `{"type":"language_model","provider":"empty","id...` |
| audio | `list[audio]` | Optional audio inputs for media reasoning tasks. Accepts a list, or a single Audio (auto-wrapped). | `[]` |
| video | `list[video]` | Optional video inputs for media reasoning tasks. Accepts a list, or a single Video (auto-wrapped). | `[]` |
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

Browse other nodes in the [nodetool.agents](./) namespace.
