---
layout: page
title: "Tap"
node_type: "nodetool.control.Tap"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Tap`

**Namespace:** `nodetool.control`

## Description

Passthrough that logs each item to the console as a side effect.
    tap, log, debug, inspect, peek, side-effect, stream

    Use cases:
    - Inspect a streaming pipeline without altering it
    - Add lightweight per-item logging
    - Debug intermediate stages of a workflow

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| input_item | `any` | Streaming input — forwarded unchanged after logging. | null |
| label | `str` | Label printed alongside each logged item. | `tap` |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output | `any` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](./) namespace.
