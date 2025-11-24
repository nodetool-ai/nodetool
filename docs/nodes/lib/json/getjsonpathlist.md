---
layout: page
title: "Get JSONPath List"
node_type: "lib.json.GetJSONPathList"
namespace: "lib.json"
---

**Type:** `lib.json.GetJSONPathList`

**Namespace:** `lib.json`

## Description

Extract a list value from a JSON path
    json, path, extract, array

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|----------|
| data | `any` | JSON object to extract from | - |
| path | `str` | Path to the desired value (dot notation) | `` |
| default | `List[Any]` | Default value to return if path is not found | `[]` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `List[Any]` |  |

## Metadata

## Related Nodes

Browse other nodes in the [lib.json](../) namespace.

