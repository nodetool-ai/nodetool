---
layout: page
title: "Collapse Whitespace"
node_type: "nodetool.text.CollapseWhitespace"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.CollapseWhitespace`

**Namespace:** `nodetool.text`

## Description

Collapses consecutive whitespace into single separators.
    text, whitespace, normalize, clean, remove

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` |  | `` |
| preserve_newlines | `bool` | Keep newline characters instead of replacing them | `false` |
| replacement | `str` | String used to replace whitespace runs | ` ` |
| trim_edges | `bool` | Strip whitespace before collapsing | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
