---
layout: page
title: "Suspendable Nodes"
description: "Build workflow nodes that can pause and resume - guide for developers."
parent: Developer Guide
---

# Suspendable Nodes

Suspendable nodes allow workflows to pause execution, save state, and resume later. This enables human-in-the-loop workflows, external callbacks, and checkpoint-based processing.

---

## Overview

A suspendable node can:

- **Suspend** the workflow and save state to the event log
- **Resume** when triggered externally (via API or UI)
- **Restore state** from the saved suspension data

This is useful for:

- **Human approvals** - Wait for a manager to approve before continuing
- **External callbacks** - Pause for webhook or API responses
- **Checkpoints** - Save progress in long-running computations
- **Interactive workflows** - Pause for user input

---

## Using the Built-in WaitNode

The simplest way to add suspension to a workflow is using the `WaitNode`:

```typescript
import { WaitNode } from "@nodetool-ai/base-nodes/nodes/triggers";

// Create a wait node that suspends the workflow
const waitNode = new WaitNode();
waitNode.timeout_seconds = 3600;  // Optional: timeout in seconds (0 = wait forever)
waitNode.input = { request_id: "REQ-123", approver: "admin@example.com" };
```

### WaitNode Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `timeout_seconds` | `number` | `0` | Timeout in seconds (0 = wait indefinitely) |
| `input` | `any` | `""` | Input data to pass through to the output when resumed |

### WaitNode Output

When resumed, the WaitNode outputs:

```typescript
{
  data: { /* input data passed through */ },
  resumed_at: "2026-03-16T12:00:00.000Z",  // ISO timestamp of resumption
  waited_seconds: 30.5                       // How long the workflow was suspended
}
```

---

## Creating Custom Suspendable Nodes

For more control, create your own suspendable node by extending `SuspendableNode`:

```typescript
import { SuspendableState } from "@nodetool-ai/kernel/suspendable";
import { BaseNode, prop } from "@nodetool-ai/node-sdk";

class ApprovalNode extends BaseNode {
  static readonly nodeType = "custom.ApprovalNode";

  @prop({ type: "str", default: "" })
  declare document_id: string;

  // Compose a SuspendableState helper for this node
  private _suspend = new SuspendableState(ApprovalNode.nodeType);

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    // Check if resuming from suspension
    if (this._suspend.isResuming()) {
      const savedState = this._suspend.getSavedState();

      if (savedState.approved) {
        return {
          status: "approved",
          approved_by: savedState.approved_by,
          approved_at: savedState.approved_at,
        };
      } else {
        return {
          status: "rejected",
          reason: savedState.rejection_reason,
        };
      }
    }

    // First execution — suspend and wait for approval
    this._suspend.suspendWorkflow(
      `Waiting for approval of document ${this.document_id}`,
      {
        document_id: this.document_id,
        submitted_at: new Date().toISOString(),
      },
      {
        approver_email: "admin@example.com",
        timeout_hours: 24,
      },
    );
    // Execution never reaches here on first run.
    // suspendWorkflow() throws WorkflowSuspendedError.
  }
}
```

---

## API Methods

### SuspendableNode Methods

#### `isSuspendable(): boolean`

Returns `true` to indicate this node supports suspension.

#### `isResuming(): boolean`

Check if the node is resuming from a previous suspension.

```typescript
if (this._suspend.isResuming()) {
  // Resumption path — get saved state
  const saved = this._suspend.getSavedState();
} else {
  // First execution path — suspend
  this._suspend.suspendWorkflow(reason, state);
}
```

#### `getSavedState(): Record<string, unknown>`

Get the state that was saved when workflow suspended.

```typescript
const savedState = this._suspend.getSavedState();
const approvalStatus = savedState.approved ?? false;
```

Throws `Error` if called when not resuming.

#### `suspendWorkflow(reason: string, state: Record<string, unknown>, metadata?: Record<string, unknown>): never`

Suspend workflow execution and save state.

```typescript
this._suspend.suspendWorkflow(
  "Waiting for user input",
  { partial_result: computedValue },
  { timeout: 3600 },
);
```

This method:

- Logs `NodeSuspended` event with state
- Logs `RunSuspended` event
- Throws `WorkflowSuspendedError` to exit execution
- Never returns (workflow is suspended)

---

## Suspension Flow

### 1. Initial Execution

```
WorkflowRunner.run()
  ├─> NodeActor executes node
  ├─> node.process() calls suspendWorkflow()
  ├─> WorkflowSuspendedError thrown
  ├─> Runner catches exception
  ├─> Logs NodeSuspended event (with state)
  ├─> Logs RunSuspended event
  ├─> Sends JobUpdate(status="suspended") to frontend
  └─> Exits cleanly
```

### 2. External Resume (via UI or API)

```
User clicks Resume button OR API call to resume endpoint
  ├─> WorkflowRecoveryService.resume_workflow()
  ├─> Loads saved state from event log
  ├─> Logs NodeResumed event
  ├─> Sets node.setResumingState()
  └─> WorkflowRunner.run() continues
```

### 3. Node Resumption

```
NodeActor executes node (resuming=True)
  ├─> node.isResuming() returns true
  ├─> node.getSavedState() returns saved state
  ├─> node.process() continues from saved state
  └─> Workflow completes normally
```

---

## Frontend Integration

When a workflow suspends:

1. **Backend sends** `JobUpdate(status="suspended", message="...")`
2. **Frontend state** changes to `"suspended"`
3. **UI shows**:
   - Notification with suspension reason
   - Purple Resume button in toolbar
   - Stop button remains enabled

When user clicks Resume:

1. **Frontend sends** `resume_job` command via WebSocket
2. **Backend resumes** workflow from saved state
3. **Frontend state** changes back to `"running"`

---

## Best Practices

1. **Always check `isResuming()`** - Handle both first execution and resumption paths
2. **Save minimal state** - Only save what's needed to resume
3. **Use descriptive reasons** - Make suspension reason clear for users
4. **Add metadata** - Include context like timeout, approver email, etc.
5. **Handle timeouts** - Consider what happens if workflow isn't resumed
6. **Test both paths** - Test both suspension and resumption code

---

## Example: Webhook Callback

```typescript
import { SuspendableState } from "@nodetool-ai/kernel/suspendable";
import { BaseNode, prop } from "@nodetool-ai/node-sdk";

class WebhookWaitNode extends BaseNode {
  static readonly nodeType = "custom.WebhookWaitNode";

  @prop({ type: "str", default: "" })
  declare callback_url: string;

  private _suspend = new SuspendableState(WebhookWaitNode.nodeType);

  async process(inputs: Record<string, unknown>): Promise<Record<string, unknown>> {
    if (this._suspend.isResuming()) {
      const state = this._suspend.getSavedState();
      return {
        webhook_id: state.webhook_id,
        callback_data: state.callback_data ?? {},
      };
    }

    // Register webhook and get ID
    const webhookId = await registerWebhook(this.callback_url);

    // Suspend until webhook is called
    this._suspend.suspendWorkflow(
      "Waiting for webhook callback",
      { webhook_id: webhookId, callback_url: this.callback_url },
      { external_service: true },
    );
  }
}
```

---

## See Also

- [Workflow Editor](../workflow-editor.md) - User guide for pause/resume controls
- [Trigger Nodes](node-patterns.md#trigger-nodes) - Nodes that fire on external events
- [Workflow API](../workflow-api.md) - API endpoints for workflow control
