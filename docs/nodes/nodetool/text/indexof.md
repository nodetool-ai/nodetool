---
layout: page
title: "Index Of"
node_type: "nodetool.text.IndexOf"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.IndexOf`

**Namespace:** `nodetool.text`

## Description

Finds the position of a substring in text.
    text, search, find, substring

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` |  | `` |
| substring | `str` |  | `` |
| case_sensitive | `bool` |  | `true` |
| start_index | `int` | Index to begin the search from | `0` |
| end_index | `int` | Optional exclusive end index for the search | `0` |
| search_from_end | `bool` | Use the last occurrence instead of the first | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
