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
| `timeout_seconds` | `number` | `0` | Seconds to wait before continuing. `0` = **no wait** (pass through immediately). |
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

## See Also

- [Trigger Nodes](node-patterns.md) - Nodes that fire on external events
- [Workflow API](../workflow-api.md) - API endpoints for workflow control
