---
layout: page
title: "Try / Catch"
node_type: "nodetool.control.TryCatch"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.TryCatch`

**Namespace:** `nodetool.control`

## Description

Fallback wrapper: passes the value through when present, or emits the fallback with error info when the value is null/undefined (e.g. an upstream step produced nothing).
    control, error, fallback, default, null, missing, flow-control

    Use cases:
    - Provide fallback values when an upstream step produced no value
    - Detect missing values in workflows
    - Log error details for debugging

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `any` | The value to pass through. When null/undefined, the fallback is used. | null |
| fallback | `any` | Value to return when the input value is null/undefined. | null |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |
| error | `str` |  |
| has_error | `bool` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](./) namespace.
