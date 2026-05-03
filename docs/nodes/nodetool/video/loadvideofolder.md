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

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| folder | `folder` | The asset folder to load the video files from. | `{"type":"folder","uri":"","asset_id":null,"data...` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| video | `video` |  |
| name | `str` |  |
| videos | `list` |  |
| names | `list` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.
