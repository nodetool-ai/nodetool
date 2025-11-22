---
layout: page
title: "Filter JSON"
node_type: "lib.json.FilterJSON"
namespace: "lib.json"
---

**Type:** `lib.json.FilterJSON`

**Namespace:** `lib.json`

## Description

Filter JSON array based on a key-value condition.
    json, filter, array

    Use cases:
    - Filter arrays of objects
    - Search JSON data

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| array | `List[Dict[Any, Any]]` | Array of JSON objects to filter | `[]` |
| key | `str` | Key to filter on | `` |
| value | `any` | Value to match | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[Dict[Any, Any]]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.json](../) namespace.

