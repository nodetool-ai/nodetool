---
layout: page
title: "Extract JSON"
node_type: "nodetool.text.ExtractJSON"
namespace: "nodetool.text"
---

**Type:** `nodetool.text.ExtractJSON`

**Namespace:** `nodetool.text`

## Description

Extracts data from JSON using JSONPath expressions.
    json, extract, jsonpath

    Use cases:
    - Retrieving specific fields from complex JSON structures
    - Filtering and transforming JSON data for analysis
    - Extracting nested data from API responses or configurations

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| text | `any` |  | `` |
| json_path | `any` |  | `$.*` |
| find_all | `any` |  | `False` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Metadata

## Related Nodes

Browse other nodes in the [nodetool.text](../) namespace.

