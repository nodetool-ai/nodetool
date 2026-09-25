---
layout: page
title: "Loop"
node_type: "nodetool.control.Loop"
namespace: "nodetool.control"
---

**Type:** `nodetool.control.Loop`

**Namespace:** `nodetool.control`

## Description

Repeat part of a workflow, using each result as the input for the next pass.
    loop, repeat, while, until, iterate, retry, refine, feedback, cycle, flow-control

    Set Initial to the starting value. Connect Value to the nodes you want to repeat, then connect their result to Next. Index counts passes from 0.

    Connect a boolean result to Condition: true runs another pass, false sends the current Next value through Done. The nodes run at least once. Max Iterations also stops the loop. If Condition is unwired, the nodes run exactly Max Iterations times.

    Example: Start at 0, add 1 to Value, send the sum to Next, and send whether the sum is less than 3 to Condition. Done outputs 3.

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
