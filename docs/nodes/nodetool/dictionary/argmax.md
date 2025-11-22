---
layout: page
title: "Arg Max"
node_type: "nodetool.dictionary.ArgMax"
namespace: "nodetool.dictionary"
---

**Type:** `nodetool.dictionary.ArgMax`

**Namespace:** `nodetool.dictionary`

## Description

Returns the label associated with the highest value in a dictionary.
    dictionary, maximum, label, argmax

    Use cases:
    - Get the most likely class from classification probabilities
    - Find the category with highest score
    - Identify the winner in a voting/ranking system

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| scores | `Dict[str, float]` | Dictionary mapping labels to their corresponding scores/values | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `str` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.dictionary](../) namespace.

