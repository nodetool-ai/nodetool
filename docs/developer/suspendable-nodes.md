---
layout: page
title: "Suspendable Nodes"
description: "Why NodeTool has no pause/resume node API, and what WaitNode actually does."
parent: Developer Guide
---

# Suspendable Nodes

**NodeTool has no suspend/resume API.** There is no `SuspendableState`, no
`SuspendableNode` interface, no `suspendWorkflow()`, and no
`WorkflowSuspendedError`. `RunResult.status` (`packages/kernel/src/runner.ts`)
is `"completed" | "failed" | "cancelled"`, and `JobStatus`
(`packages/protocol/src/messages.ts`) adds only `"pending"`, `"running"`, and
`"error"` — none of them is `"suspended"`. A node cannot pause a run and be
resumed later.

`packages/models/src/run-event.ts` does declare `RunSuspended`, `NodeSuspended`,
and `NodeResumed` event types, but nothing in the runtime emits them.

For a run that needs to wait on something external, the shapes that do exist
are trigger nodes (`packages/kernel/src/trigger-wakeup.ts` delivers an event to
a registered trigger and starts a run), the webhook route
(`POST /api/webhooks/:token`), and the interactive escalation path — a run
started with `interactive: true` parks on a failing node and waits for the
caller's verdict (see [Workflow Supervisor](../workflow-supervisor-design.md)).

---

## The Built-in WaitNode (a delay, not a suspension)

> **Important:** `WaitNode` (`nodetool.triggers.Wait`, in
> `packages/automation-nodes/src/nodes/triggers.ts`) does not suspend anything.
> It is a simple in-process delay: `process()` sleeps for `timeout_seconds` via
> `setTimeout`, then passes its input through. The run stays alive and in
> memory for the whole delay. Use it for rate-limiting and fixed delays.

```typescript
import { WaitNode } from "@nodetool-ai/automation-nodes";

// A node that delays for a fixed number of seconds, then forwards `input`.
const waitNode = new WaitNode();
waitNode.timeout_seconds = 5;  // Seconds to wait (0 = no wait, pass through immediately)
waitNode.input = { request_id: "REQ-123" };
```

### WaitNode Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `timeout_seconds` | `int` (minimum 0) | `0` | Seconds to wait before continuing. `0` = **no wait** (pass through immediately). |
| `input` | `any` | `""` | Input data passed through to the output after the delay |

### WaitNode Output

After the delay, the WaitNode outputs:

```typescript
{
  data: { /* input data passed through */ },
  resumed_at: "2026-03-16T12:00:00.000Z",  // ISO timestamp after the delay
  waited_seconds: 5.0                        // Actual seconds slept
}
```

> The output field names (`resumed_at`, `waited_seconds`) read like suspension
> semantics, but they only reflect the `setTimeout` delay — nothing was
> suspended.

---

## Writing a trigger node

A trigger node is how a node "waits" for an outside event. Set `static readonly isTrigger = true` on the class. When a run starts because an event arrived (the run request carries a `trigger_event` that targets the node), the kernel calls `emitTriggerEvent(event, outputs)` instead of the live-listening `genProcess()` loop. Without a trigger event, the node keeps its streaming behavior, which is what an in-editor live test uses.

```ts
import type { StreamingOutputs, TriggerEvent } from "@nodetool-ai/node-sdk";

async emitTriggerEvent(event: TriggerEvent, outputs: StreamingOutputs): Promise<void> {
  await outputs.emit("data", event.payload);
}
```

`TriggerEvent` has `node_id`, `payload`, and `input_id` (the idempotency key of the stored trigger input). The default implementation on `BaseNode` copies each key of an object payload to the declared output of the same name and drops other keys. Override it to shape adapter payloads onto your outputs. `nodetool.triggers.ManualTrigger` in `packages/automation-nodes/src/nodes/triggers.ts` is a complete example. To fire a trigger from the CLI, pass `--trigger-event` to `nodetool workflows run` (see the [CLI reference](../cli.md)).

---

## See Also

- [Triggers design](../triggers-design.md) - How triggers register, fire, and start runs
- [Workflow API](../workflow-api.md) - API endpoints for workflow control
