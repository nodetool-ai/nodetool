---
layout: page
title: "Loop"
node_type: "nodetool.control.Loop"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Loop`

**Namespace:** `nodetool.control`

## Description

Repeat a section of the workflow, feeding each result back in, until a condition turns false.
    loop, repeat, while, until, iterate, retry, refine, feedback, cycle, flow-control

    Wire value and index into the loop body, and wire the body's result back into next and its decision into condition. Each iteration runs the body once. When condition is false, or after max_iterations, the last next value leaves through done.

    Use cases:
    - Refine a draft until a judge accepts it
    - Retry a generation until it passes a check
    - Apply a step a fixed number of times, feeding each result into the next

## Properties

| Property | Type | Description | Default |
|----------|------|-------------|---------|
| initial | `any` | The value the first iteration starts from. | null |
| next | `any` | The value for the next iteration. Wire it from the end of the loop body. | null |
| condition | `bool` | Loop again while true. Wire it from the loop body. Unwired, the body runs max_iterations times. | `true` |
| max_iterations | `int` | Upper bound on how many times the body runs. The loop exits through done when it is reached. | - |

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| value | `any` |  |
| index | `int` |  |
| done | `any` |  |

## Related Nodes

Browse other nodes in the [nodetool.control](./) namespace.
