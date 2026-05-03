---
layout: page
title: "Load Image Folder"
node_type: "nodetool.image.LoadImageFolder"
namespace: "nodetool.image"
---

**Type:** `nodetool.image.LoadImageFolder`

**Namespace:** `nodetool.image`

## Description

Load all images from a folder, optionally including subfolders.
    image, load, folder, files

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| folder | `str` | Folder to scan for images | `` |
| include_subdirectories | `bool` | Include images in subfolders | `false` |
| extensions | `list[str]` | Image file extensions to include | `[".png",".jpg",".jpeg",".bmp",".gif",".webp","....` |
| pattern | `str` | Pattern to match image files | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| image | `image` |  |
| path | `str` |  |
| images | `list` |  |

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.
