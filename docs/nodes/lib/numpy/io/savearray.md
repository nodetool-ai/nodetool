---
layout: page
title: "Save Array"
node_type: "lib.numpy.io.SaveArray"
namespace: "lib.numpy.io"
---

**Type:** `lib.numpy.io.SaveArray`

**Namespace:** `lib.numpy.io`

## Description

Save a numpy array to a file in the specified folder.
    array, save, file, storage

    Use cases:
    - Store processed arrays for later use
    - Save analysis results
    - Create checkpoints in processing pipelines

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `any` | The array to save. | `{'type': 'np_array', 'value': None, 'dtype': '<i8', 'shape': [1]}` |
| folder | `any` | The folder to save the array in. | `{'type': 'folder', 'uri': '', 'asset_id': None, 'data': None}` |
| name | `any` | 
        The name of the asset to save.
        You can use time and date variables to create unique names:
        %Y - Year
        %m - Month
        %d - Day
        %H - Hour
        %M - Minute
        %S - Second
         | `%Y-%m-%d_%H-%M-%S.npy` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.numpy.io](../) namespace.

