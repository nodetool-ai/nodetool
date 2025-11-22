---
layout: page
title: "Save Audio File"
node_type: "nodetool.audio.SaveAudioFile"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.SaveAudioFile`

**Namespace:** `nodetool.audio`

## Description

Write an audio file to disk.
    audio, output, save, file

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| audio | `any` | The audio to save | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| folder | `any` | Folder where the file will be saved | `` |
| filename | `any` | 
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
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.

