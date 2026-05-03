---
layout: page
title: "Load Text Folder"
node_type: "nodetool.text.LoadTextFolder"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.LoadTextFolder`

**Namespace:** `nodetool.text`

## Description

Load all text files from a folder, optionally including subfolders.
    text, load, folder, files

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| folder | `str` | Folder to scan for text files | `` |
| include_subdirectories | `bool` | Include text files in subfolders | `false` |
| extensions | `list[str]` | Text file extensions to include | `[".txt",".csv",".json",".xml",".md",".html",".p...` |
| pattern | `str` | Pattern to match text files | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| path | `str` |  |
| texts | `list` |  |
| paths | `list` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
