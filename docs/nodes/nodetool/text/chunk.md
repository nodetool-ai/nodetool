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

    Use cases:
    - Preparing text for processing by models with input length limits
    - Creating manageable text segments for parallel processing
    - Generating summaries of text sections

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `any` |  | `` |
| length | `any` |  | `100` |
| overlap | `any` |  | `0` |
| separator | `any` |  | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

