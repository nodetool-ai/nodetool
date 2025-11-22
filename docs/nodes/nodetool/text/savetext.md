---
layout: page
title: "Save Text"
node_type: "nodetool.text.SaveText"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.SaveText`

**Namespace:** `nodetool.text`

## Description

Saves input text to a file in the assets folder.
    text, save, file

    Use cases:
    - Persisting processed text results
    - Creating text files for downstream nodes or external use
    - Archiving text data within the workflow

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `any` |  | `` |
| folder | `any` | Name of the output folder. | `{'type': 'folder', 'uri': '', 'asset_id': None, 'data': None}` |
| name | `any` | 
        Name of the output file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         | `%Y-%m-%d-%H-%M-%S.txt` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

