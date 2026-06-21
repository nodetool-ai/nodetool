---
layout: page
title: "Lip Sync"
node_type: "nodetool.video.LipSync"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.LipSync`

**Namespace:** `nodetool.video`

## Description

Drive a face in a video to match speech in an audio track using any supported lip-sync provider.
    video, lip-sync, lipsync, talking-head, dubbing, AI

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `video_model` | The lip-sync model to use | `{"type":"video_model","provider":"fal_ai","id":...` |
| video | `video` | The input video containing the face to drive | `{"type":"video","uri":"","asset_id":null,"data"...` |
| audio | `audio` | The audio track the mouth motion should follow | `{"type":"audio","uri":"","asset_id":null,"data"...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](./) namespace.
