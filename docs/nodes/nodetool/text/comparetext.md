---
layout: page
title: "Compare Text"
node_type: "nodetool.text.Compare"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.Compare`

**Namespace:** `nodetool.text`

## Description

Compares two text values and reports ordering.
    text, compare, equality, sort, equals, =

    Use cases:
    - Checking if two strings are identical before branching
    - Determining lexical order for sorting or deduplication
    - Normalizing casing/spacing before compares

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| text_a | `str` |  | `` |
| text_b | `str` |  | `` |
| case_sensitive | `bool` | Compare without lowercasing | `true` |
| trim_whitespace | `bool` | Strip leading/trailing whitespace before comparing | `false` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.
