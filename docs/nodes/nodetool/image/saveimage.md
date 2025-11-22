---
layout: page
title: "Save Image Asset"
node_type: "nodetool.image.SaveImage"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.SaveImage`

**Namespace:** `nodetool.image`

## Description

Save an image to specified asset folder with customizable name format.
    save, image, folder, naming

    Use cases:
    - Save generated images with timestamps
    - Organize outputs into specific folders
    - Create backups of processed images

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| image | `any` | The image to save. | `{'type': 'image', 'uri': '', 'asset_id': None, 'data': None}` |
| folder | `any` | The asset folder to save the image in. | `{'type': 'folder', 'uri': '', 'asset_id': None, 'data': None}` |
| name | `any` | 
        Name of the output file.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         | `%Y-%m-%d_%H-%M-%S.png` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.

