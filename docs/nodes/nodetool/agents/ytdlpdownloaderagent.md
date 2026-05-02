---
layout: page
title: "yt-dlp Downloader Agent"
node_type: "nodetool.agents.YtDlpDownloaderAgent"
namespace: "nodetool.agents"
---

**Type:** `nodetool.agents.YtDlpDownloaderAgent`

**Namespace:** `nodetool.agents`

## Description

Download videos from YouTube/Bilibili/Twitter and other sites via yt-dlp.
    skills, media, yt-dlp, downloader, youtube, bilibili, twitter

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `language_model` | Model used for yt-dlp planning and execution reasoning. | `{"type":"language_model","provider":"empty","id...` |
| prompt | `str` | Prompt describing what to download. | `` |
| url | `str` | Optional explicit video URL to download. | `` |
| output_dir | `str` | Workspace-relative output directory for downloads. | `downloads/yt-dlp` |
| timeout_seconds | `int` | Maximum runtime for agent execution. | `300` |
| max_output_chars | `int` | Maximum serialized output chars before truncation. | `220000` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| video | `video` |  |
| text | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.agents](../) namespace.
