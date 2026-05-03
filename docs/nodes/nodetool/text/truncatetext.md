---
layout: page
title: "Truncate Text"
node_type: "nodetool.text.TruncateText"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.TruncateText`

**Namespace:** `nodetool.text`

## Description

Truncates text to a maximum length.
    text, truncate, length, clip

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` |  | `` |
| max_length | `int` |  | `100` |
| ellipsis | `str` | Optional suffix appended when truncation occurs | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
