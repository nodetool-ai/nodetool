---
layout: page
title: "Filter"
node_type: "nodetool.dictionary.Filter"
namespace: "nodetool.dictionary"
---

**Type:** `nodetool.dictionary.Filter`

**Namespace:** `nodetool.dictionary`

## Description

Creates a new dictionary with only specified keys from the input.
    dictionary, filter, select

    Use cases:
    - Extract relevant fields from a larger data structure
    - Implement data access controls
    - Prepare specific data subsets for processing

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| dictionary | `Dict[str, any]` |  | `{}` |
| keys | `List[str]` |  | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[str, any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.dictionary](../) namespace.

