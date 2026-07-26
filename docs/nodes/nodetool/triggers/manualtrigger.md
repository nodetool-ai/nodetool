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
| max_events | `int` | Events to process before the node stops listening (0 = unlimited). Applies only while the node listens in a running workflow; a fired trigger starts its own run and emits exactly one event. | `0` |
| name | `str` | Name for this trigger, emitted on the source output | `manual_trigger` |
| timeout_seconds | `float` | How long to wait for the next event before stopping (empty = wait forever). Applies only while the node listens in a running workflow. | null |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| data | `any` |  |
| timestamp | `str` |  |
| source | `str` |  |
| event_type | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.triggers](./) namespace.
