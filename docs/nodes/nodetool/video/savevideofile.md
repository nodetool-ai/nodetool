---
layout: page
title: "Save Video File"
node_type: "nodetool.video.SaveVideoFile"
namespace: "nodetool.video"
---

**Type:** `nodetool.video.SaveVideoFile`

**Namespace:** `nodetool.video`

## Description

Write a video file to disk.
    video, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| video | `video` | The video to save | `{'type': 'video', 'uri': '', 'asset_id': None, 'data': None, 'duration': None, 'format': None}` |
| folder | `str` | Folder where the file will be saved | `` |
| filename | `str` | 
        Name of the file to save.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `video` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.video](../) namespace.

