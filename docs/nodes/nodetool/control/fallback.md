---
layout: page
title: "Fallback"
node_type: "nodetool.control.TryCatch"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.TryCatch`

**Namespace:** `nodetool.control`

## Description

Substitute a fallback value when the input is null or undefined. Does not catch exceptions — it only detects a missing value and swaps in the fallback.
    control, fallback, default, null, undefined, missing, coalesce, flow-control

    Use cases:
    - Provide a default when an upstream step produced no value
    - Detect missing values in workflows
    - Flag whether the fallback was used

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
