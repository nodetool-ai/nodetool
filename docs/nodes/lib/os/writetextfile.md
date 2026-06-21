---
layout: page
title: "Write Text File"
node_type: "lib.os.WriteTextFile"
namespace: "lib.os"
---

**Type:** `lib.os.WriteTextFile`

**Namespace:** `lib.os`

## Description

Write text to a file in the workspace.
    os, file, write, text, save

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| path | `str` | Relative path to file within workspace | `` |
| content | `str` | Text content to write | `` |
| encoding | `str` | Text encoding (utf-8, ascii, etc.) | `utf-8` |
| append | `bool` | Append to file instead of overwriting | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [lib.os](./) namespace.
