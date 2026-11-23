---
layout: page
title: "Save Audio"
node_type: "nodetool.audio.SaveAudio"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.SaveAudio`

**Namespace:** `nodetool.audio`

## Description

Save audio into the project folder, or to a folder on disk.
    audio, output, save, file, asset

    The filename can include time and date variables:
    %Y - Year, %m - Month, %d - Day
    %H - Hour, %M - Minute, %S - Second

    Supported formats: mp3, wav, ogg, flac, aac, m4a

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| audio | `audio` | The audio to save | `{"type":"audio","uri":"","asset_id":null,"data"...` |
| save_to_workspace | `bool` |  | `true` |
| folder | `str` | Folder where the file will be saved | `` |
| filename | `str` |          Name of the file to save.         You can use time and date variables to create unique names:         %Y - Year         %m - Month         %d - Day         %H - Hour         %M - Minute         %S - Second          | `` |
| overwrite | `bool` | Overwrite the file if it already exists, otherwise file will be renamed | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `audio` |  |
| path | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](./) namespace.
