---
layout: page
title: "Split JSON"
node_type: "nodetool.document.SplitJSON"
namespace: "nodetool.document"
---

**Type:** `nodetool.document.SplitJSON`

**Namespace:** `nodetool.document`

## Description

Split JSON content into semantic chunks.
    json, parsing, semantic, structured

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| document | `any` | Document ID to associate with the JSON content | `{'type': 'document', 'uri': '', 'asset_id': None, 'data': None}` |
| include_metadata | `any` | Whether to include metadata in nodes | `True` |
| include_prev_next_rel | `any` | Whether to include prev/next relationships | `True` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `any` |  |
| source_id | `any` |  |
| start_index | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.document](../) namespace.

