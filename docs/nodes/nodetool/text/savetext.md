---
layout: page
title: "Save Text"
node_type: "nodetool.text.SaveText"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.SaveText`

**Namespace:** `nodetool.text`

## Description

Save text to a file in the project folder, or to a folder on disk.
    text, save, file, output

    Use cases:
    - Persisting processed text results
    - Creating text files for downstream nodes or external use
    - Archiving text data within the workflow

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` |  | `` |
| save_to_workspace | `bool` |  | `true` |
| folder | `str` | Path to the output folder. | `` |
| filename | `str` |          Name of the output file.         You can use time and date variables to create unique names:         %Y - Year         %m - Month         %d - Day         %H - Hour         %M - Minute         %S - Second          | `%Y-%m-%d-%H-%M-%S.txt` |
| overwrite | `bool` | Overwrite the file if it already exists, otherwise file will be renamed | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `text` |  |
| path | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](./) namespace.
