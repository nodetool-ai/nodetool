---
layout: page
title: "Save Image File"
node_type: "nodetool.image.SaveImageFile"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.SaveImageFile`

**Namespace:** `nodetool.image`

## Description

Write an image to disk.
    image, output, save, file

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| image | `image` | The image to save | `{"type":"image","uri":"","asset_id":null,"data"...` |
| folder | `str` | Folder where the file will be saved | `` |
| filename | `str` |          The name of the image file.         You can use time and date variables to create unique names:         %Y - Year         %m - Month         %d - Day         %H - Hour         %M - Minute         %S - Second          | `` |
| overwrite | `bool` | Overwrite the file if it already exists, otherwise file will be renamed | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `image` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.
