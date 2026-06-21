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
| timeout_seconds | `int` | Seconds to wait before continuing (0 = no wait) | `0` |
| input | `any` | Input data to pass through to the output after waiting | `` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| data | `any` |  |
| resumed_at | `str` |  |
| waited_seconds | `float` |  |

## Related Nodes

Browse other nodes in the [nodetool.triggers](./) namespace.
