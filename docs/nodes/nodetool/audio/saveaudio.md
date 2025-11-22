---
layout: page
title: "Save Audio Asset"
node_type: "nodetool.audio.SaveAudio"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.SaveAudio`

**Namespace:** `nodetool.audio`

## Description

Save an audio file to a specified asset folder.
    audio, folder, name

    Use cases:
    - Save generated audio files with timestamps
    - Organize outputs into specific folders
    - Create backups of generated audio

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| audio | `any` |  | `{'type': 'audio', 'uri': '', 'asset_id': None, 'data': None}` |
| folder | `any` | The asset folder to save the audio file to.  | `{'type': 'folder', 'uri': '', 'asset_id': None, 'data': None}` |
| name | `any` | 
        The name of the audio file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         | `%Y-%m-%d-%H-%M-%S.opus` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.

