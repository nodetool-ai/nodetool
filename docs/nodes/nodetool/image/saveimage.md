---
layout: page
title: "Save Image"
node_type: "nodetool.image.SaveImage"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.SaveImage`

**Namespace:** `nodetool.image`

## Description

Save an image into the project folder, or to a folder on disk.
    image, output, save, file, asset

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to save | `{"type":"image","uri":"","asset_id":null,"data"...` |
| save_to_workspace | `bool` |  | `true` |
| folder | `str` | Folder where the file will be saved | `` |
| filename | `str` |          The name of the image file.         You can use time and date variables to create unique names:         %Y - Year         %m - Month         %d - Day         %H - Hour         %M - Minute         %S - Second          | `` |
| overwrite | `bool` | Overwrite the file if it already exists, otherwise file will be renamed | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |
| path | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](./) namespace.
