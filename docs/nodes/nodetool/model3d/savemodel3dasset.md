---
layout: page
title: "Save Model3D Asset"
node_type: "nodetool.model3d.SaveModel3D"
namespace: "nodetool.model3d"
---

**Type:** `nodetool.model3d.SaveModel3D`

**Namespace:** `nodetool.model3d`

## Description

Save a 3D model to an asset folder with customizable name format.
    save, 3d, mesh, model, folder, naming, asset

    Use cases:
    - Save generated 3D models with timestamps
    - Organize outputs into specific folders
    - Create backups of processed models

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| model | `model_3d` | The 3D model to save. | - |
| folder | `folder` | The asset folder to save the 3D model in. | - |
| name | `str` |          Name of the output file.         You can use time and date variables to create unique names:         %Y - Year         %m - Month         %d - Day         %H - Hour         %M - Minute         %S - Second          | `%Y-%m-%d_%H-%M-%S.glb` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `model_3d` |  |

## Related Nodes

Browse other nodes in the [nodetool.model3d](../) namespace.
