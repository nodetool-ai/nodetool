---
layout: page
title: "Load Audio Folder"
node_type: "nodetool.audio.LoadAudioFolder"
namespace: "nodetool.audio"
---

**Type:** `nodetool.audio.LoadAudioFolder`

**Namespace:** `nodetool.audio`

## Description

Load all audio files from a folder, optionally including subfolders.
    audio, load, folder, files

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| folder | `str` | Folder to scan for audio files | `` |
| include_subdirectories | `bool` | Include audio in subfolders | `false` |
| extensions | `list[str]` | Audio file extensions to include | `[".mp3",".wav",".flac",".ogg",".m4a",".aac"]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `audio` |  |
| path | `str` |  |
| audios | `list` |  |

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.
