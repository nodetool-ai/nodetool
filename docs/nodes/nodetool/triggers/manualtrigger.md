---
layout: page
title: "Manual Trigger"
node_type: "nodetool.triggers.ManualTrigger"
namespace: "nodetool.triggers"
---

**Type:** `nodetool.triggers.ManualTrigger`

**Namespace:** `nodetool.triggers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| max_events | `int` | Maximum number of events to process (0 = unlimited) | `0` |
| name | `str` | Name for this trigger (used in API calls) | `manual_trigger` |
| timeout_seconds | `float` | Timeout waiting for events (None = wait forever) | null |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| data | `any` |  |
| timestamp | `str` |  |
| source | `str` |  |
| event_type | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.triggers](../) namespace.
