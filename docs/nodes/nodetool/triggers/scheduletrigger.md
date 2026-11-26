---
layout: page
title: "Schedule Trigger"
node_type: "nodetool.triggers.ScheduleTrigger"
namespace: "nodetool.triggers"
---

**Type:** `nodetool.triggers.ScheduleTrigger`

**Namespace:** `nodetool.triggers`

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| max_events | `int` | Events to emit before the node stops (0 = unlimited). Applies only while the node runs in the editor. The scheduler keeps firing an activated trigger regardless. | `0` |
| cron_expr | `str` | Five fields: minute hour day-of-month month day-of-week. For example 0 8 * * 1-5 is every weekday at 08:00. | - |
| cron_tz | `str` | IANA timezone the expression is read in, such as Europe/Berlin or America/New_York. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| scheduled_at | `str` |  |
| timestamp | `str` |  |
| source | `str` |  |
| event_type | `str` |  |

## Related Nodes

Browse other nodes in the [nodetool.triggers](./) namespace.
