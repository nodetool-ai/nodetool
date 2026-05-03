---
layout: page
title: "Save Model 3D File"
node_type: "nodetool.model3d.SaveModel3DFile"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.SaveModel3DFile`

**Namespace:** `nodetool.model3d`

## Description

Save a 3D model to disk.
    3d, mesh, model, output, save, file, export

    Use cases:
    - Save processed 3D models
    - Export meshes to different formats
    - Archive 3D model results

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to save | - |
| folder | `str` | Folder where the file will be saved | `` |
| filename | `str` |          The name of the 3D model file.         You can use time and date variables to create unique names:         %Y - Year         %m - Month         %d - Day         %H - Hour         %M - Minute         %S - Second          | `` |
| overwrite | `bool` | Overwrite the file if it already exists, otherwise file will be renamed | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
