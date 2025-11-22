---
layout: page
title: "Load Video Folder"
node_type: "nodetool.video.LoadVideoAssets"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.LoadVideoAssets`

**Namespace:** `nodetool.video`

## Description

Load video files from an asset folder.

    video, assets, load

    Use cases:
    - Provide videos for batch processing
    - Iterate over stored video assets
    - Prepare clips for editing or analysis

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| folder | `folder` | The asset folder to load the video files from. | `{'type': 'folder', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| video | `video` |  |
| name | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

