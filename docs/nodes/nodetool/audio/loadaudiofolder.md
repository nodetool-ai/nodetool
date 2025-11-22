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

    Use cases:
    - Batch import audio for processing
    - Build datasets from a directory tree
    - Iterate over audio collections

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| folder | `any` | Folder to scan for audio files | `` |
| include_subdirectories | `any` | Include audio in subfolders | `False` |
| extensions | `any` | Audio file extensions to include | `['.mp3', '.wav', '.flac', '.ogg', '.m4a', '.aac']` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| audio | `any` |  |
| path | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.audio](../) namespace.

