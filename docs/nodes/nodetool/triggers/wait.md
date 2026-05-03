---
layout: page
title: "Wait"
node_type: "nodetool.triggers.Wait"
namespace: "nodetool.triggers"
---

**Type:** `nodetool.triggers.Wait`

**Namespace:** `nodetool.triggers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| timeout_seconds | `int` | Optional timeout in seconds (0 = wait indefinitely) | `0` |
| input | `any` | Input data to pass through to the output when resumed | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| data | `any` |  |
| resumed_at | `str` |  |
| waited_seconds | `float` |  |

## Related Nodes

Browse other nodes in the [nodetool.triggers](../) namespace.
