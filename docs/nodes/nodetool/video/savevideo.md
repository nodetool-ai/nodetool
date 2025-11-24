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

    Use cases:
    1. Export processed video to a specific asset folder
    2. Save video with a custom name
    3. Create a copy of a video in a different location

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `video` | The video to save. | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| folder | `folder` | The asset folder to save the video in. | `{'type': 'folder', 'uri': '', 'asset_id': None, 'data': None}` |
| name | `str` | 
        Name of the output video.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         | `%Y-%m-%d-%H-%M-%S.mp4` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

