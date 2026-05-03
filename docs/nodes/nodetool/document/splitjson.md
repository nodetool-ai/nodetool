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
|----------|------|-------------|---------|
| document | `document` | Document ID to associate with the JSON content | `{"type":"document","uri":"","asset_id":null,"da...` |
| include_metadata | `bool` | Whether to include metadata in nodes | `true` |
| include_prev_next_rel | `bool` | Whether to include prev/next relationships | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| text | `str` |  |
| source_id | `str` |  |
| start_index | `int` |  |
| chunks | `list` |  |

## Related Nodes

Browse other nodes in the [nodetool.document](../) namespace.
