---
layout: page
title: "Save Video File"
node_type: "nodetool.workspace.SaveVideoFile"
namespace: "nodetool.workspace"
---

**Type:** `nodetool.workspace.SaveVideoFile`

**Namespace:** `nodetool.workspace`

## Description

Save a video file to the workspace.
    workspace, video, save, file, output

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| video | `video` | The video to save | `{"type":"video","uri":"","asset_id":null,"data"...` |
| folder | `str` | Relative folder path within workspace (use . for workspace root) | `.` |
| filename | `str` |          Name of the file to save.         You can use time and date variables to create unique names:         %Y - Year         %m - Month         %d - Day         %H - Hour         %M - Minute         %S - Second          | `video.mp4` |
| overwrite | `bool` | Overwrite the file if it already exists, otherwise file will be renamed | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Related Nodes

Browse other nodes in the [nodetool.workspace](../) namespace.
