---
layout: page
title: "Try / Catch"
node_type: "nodetool.control.TryCatch"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.TryCatch`

**Namespace:** `nodetool.control`

## Description

Error handling wrapper: passes the value through on success, or returns error info on failure.
    control, error, try, catch, exception, handling, retry, flow-control

    Use cases:
    - Gracefully handle errors in workflows
    - Provide fallback values when operations fail
    - Log error details for debugging

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| value | `any` | The value to pass through. If this node receives an error signal, the fallback is used. | null |
| fallback | `any` | Value to return if an error occurs. | null |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |
| error | `str` |  |
| has_error | `bool` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](../) namespace.
