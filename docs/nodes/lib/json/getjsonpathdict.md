---
layout: page
title: "Get JSONPath Dict"
node_type: "lib.json.GetJSONPathDict"
namespace: "lib.json"
---

**Type:** `lib.json.GetJSONPathDict`

**Namespace:** `lib.json`

## Description

Extract a dictionary value from a JSON path
    json, path, extract, object

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| data | `any` | JSON object to extract from | - |
| path | `str` | Path to the desired value (dot notation) | `` |
| default | `Dict[Any, Any]` | Default value to return if path is not found | `{}` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `Dict[Any, Any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.json](../) namespace.

