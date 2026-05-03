---
layout: page
title: "Save Video Asset"
node_type: "nodetool.video.SaveVideo"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.SaveVideo`

**Namespace:** `nodetool.video`

## Description

Save a video to an asset folder.
    video, save, file, output

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The video to save. | `{"type":"video","uri":"","asset_id":null,"data"...` |
| folder | `folder` | The asset folder to save the video in. | `{"type":"folder","uri":"","asset_id":null,"data...` |
| name | `str` |          Name of the output video.         You can use time and date variables to create unique names:         %Y - Year         %m - Month         %d - Day         %H - Hour         %M - Minute         %S - Second          | `%Y-%m-%d-%H-%M-%S.mp4` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
