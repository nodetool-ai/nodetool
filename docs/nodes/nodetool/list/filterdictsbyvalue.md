---
layout: page
title: "Filter Dicts By Value"
node_type: "nodetool.list.FilterDictsByValue"
namespace: "nodetool.list"
---

**Type:** `nodetool.list.FilterDictsByValue`

**Namespace:** `nodetool.list`

## Description

Filters a list of dictionaries based on their values using various criteria.
    list, filter, dictionary, values

    Use cases:
    - Filter dictionaries by value content
    - Filter dictionaries by value type
    - Filter dictionaries by value patterns

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| values | `any` |  | `[]` |
| key | `any` | The dictionary key to check | `` |
| filter_type | `any` | The type of filter to apply | `contains` |
| criteria | `any` | The filtering criteria (text to match, type name, or length as string) | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.list](../) namespace.

