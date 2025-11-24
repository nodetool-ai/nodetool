---
layout: page
title: "Zip"
node_type: "nodetool.dictionary.Zip"
namespace: "nodetool.dictionary"
---

**Type:** `nodetool.dictionary.Zip`

**Namespace:** `nodetool.dictionary`

## Description

Creates a dictionary from parallel lists of keys and values.
    dictionary, create, zip

    Use cases:
    - Convert separate data columns into key-value pairs
    - Create lookups from parallel data structures
    - Transform list data into associative arrays

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| keys | `List[any]` |  | `[]` |
| values | `List[any]` |  | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[any, any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.dictionary](../) namespace.

