---
layout: page
title: "Asset Folder Input"
node_type: "nodetool.input.AssetFolderInput"
namespace: "nodetool.input"
---

**Type:** `nodetool.input.AssetFolderInput`

**Namespace:** `nodetool.input`

## Description

Accepts an asset folder as a parameter for workflows.
    input, parameter, folder, path, folderpath, local_folder, filesystem

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| name | `str` | The parameter name for the workflow. | `` |
| value | `folder` | The folder to use as input. | `{'type': 'folder', 'uri': '', 'asset_id': None, 'data': None}` |
| description | `str` | The description of the input for the workflow. | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `folder` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.input](../) namespace.

