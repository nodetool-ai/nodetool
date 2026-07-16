---
layout: page
title: "Asset Collection"
node_type: "nodetool.control.Collection"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Collection`

**Namespace:** `nodetool.control`

## Description

A curated collection of assets of a single type. Streams each item one at a time for downstream processing.
    collection, gallery, assets, curate, pick, winners, iterator, stream, batch

    Use cases:
    - Hand-pick the best generations and feed them to the next step
    - Gather assets dropped from the asset panel, files, or generation history
    - Drive a downstream pipeline with a fixed set of media

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| items | `list[any]` |  | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |
| index | `int` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](./) namespace.
