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

    Use cases:
    - Batch import images for processing
    - Build datasets from a directory tree
    - Iterate over photo collections

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| folder | `any` | Folder to scan for images | `` |
| include_subdirectories | `any` | Include images in subfolders | `False` |
| extensions | `any` | Image file extensions to include | `['.png', '.jpg', '.jpeg', '.bmp', '.gif', '.webp', '.tiff']` |
| pattern | `any` | Pattern to match image files | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| image | `any` |  |
| path | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.image](../) namespace.

