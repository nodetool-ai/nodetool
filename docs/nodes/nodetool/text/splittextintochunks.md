---
layout: page
title: "Split Text into Chunks"
node_type: "nodetool.text.Chunk"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.Chunk`

**Namespace:** `nodetool.text`

## Description

Splits text into chunks of specified word length.
    text, chunk, split

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text | `str` |  | `` |
| length | `int` |  | `100` |
| overlap | `int` |  | `0` |
| separator | `str` |  | ` ` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `list[str]` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
