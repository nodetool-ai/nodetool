---
layout: page
title: "Load Text Assets"
node_type: "nodetool.text.LoadTextAssets"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.LoadTextAssets`

**Namespace:** `nodetool.text`

## Description

Load text files from an asset folder.
    load, text, file, import

    Use cases:
    - Loading multiple text files for batch processing
    - Importing text content from a directory
    - Processing collections of text documents

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| folder | `any` | The asset folder to load the text files from. | `{'type': 'folder', 'uri': '', 'asset_id': None, 'data': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `any` |  |
| name | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

