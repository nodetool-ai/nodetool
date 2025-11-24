---
layout: page
title: "To List"
node_type: "nodetool.data.ToList"
namespace: "nodetool.data"
---

**Type:** `nodetool.data.ToList`

**Namespace:** `nodetool.data`

## Description

Convert dataframe to list of dictionaries.
    dataframe, list, convert

    Use cases:
    - Convert dataframe data for API consumption
    - Transform data for JSON serialization
    - Prepare data for document-based storage

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dataframe | `dataframe` | The input dataframe to convert. | `{'type': 'dataframe', 'uri': '', 'asset_id': None, 'data': None, 'columns': None}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[Dict[Any, Any]]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.data](../) namespace.

