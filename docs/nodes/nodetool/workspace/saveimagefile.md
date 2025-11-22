---
layout: page
title: "Save Image File"
node_type: "nodetool.workspace.SaveImageFile"
namespace: "nodetool.workspace"
---

**Type:** `nodetool.workspace.SaveImageFile`

**Namespace:** `nodetool.workspace`

## Description

Save an image to a file in the workspace.
    workspace, image, save, file, output

    Use cases:
    - Save processed images to workspace
    - Export edited photos
    - Archive image results

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `image` | The image to save | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| folder | `str` | Relative folder path within workspace (use . for workspace root) | `.` |
| filename | `str` | 
        The name of the image file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         | `image.png` |
| overwrite | `bool` | Overwrite the file if it already exists, otherwise file will be renamed | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.workspace](../) namespace.

