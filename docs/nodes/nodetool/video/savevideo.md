---
layout: page
title: "Save Video"
node_type: "nodetool.video.SaveVideo"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.SaveVideo`

**Namespace:** `nodetool.video`

## Description

Save a video into the project folder, or to a folder on disk.
    video, output, save, file, asset

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The video to save | - |
| save_to_workspace | `bool` |  | `true` |
| folder | `str` | Folder where the file will be saved | `` |
| filename | `str` |          Name of the file to save.         You can use time and date variables to create unique names:         %Y - Year         %m - Month         %d - Day         %H - Hour         %M - Minute         %S - Second          | `` |
| overwrite | `bool` | Overwrite the file if it already exists, otherwise file will be renamed | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |
| path | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.video](./) namespace.
