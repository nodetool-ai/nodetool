---
layout: page
title: "Interval Trigger"
node_type: "nodetool.triggers.IntervalTrigger"
namespace: "nodetool.triggers"
---

**Type:** `nodetool.triggers.IntervalTrigger`

**Namespace:** `nodetool.triggers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| max_events | `int` | Maximum number of events to process (0 = unlimited) | `0` |
| interval_seconds | `float` | Interval between triggers in seconds | `60` |
| initial_delay_seconds | `float` | Delay before the first trigger fires | `0` |
| emit_on_start | `bool` | Whether to emit an event immediately on start | `true` |
| include_drift_compensation | `bool` | Compensate for execution time to maintain accurate intervals | `true` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| tick | `int` |  |
| elapsed_seconds | `float` |  |
| interval_seconds | `float` |  |
| timestamp | `str` |  |
| source | `str` |  |
| event_type | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.triggers](../) namespace.
