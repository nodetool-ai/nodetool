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

```python
from nodetool.nodes.nodetool.triggers import WaitNode

# Create a wait node that suspends the workflow
wait_node = WaitNode(
    wait_reason="Waiting for manager approval",
    timeout_seconds=3600,  # Optional: timeout in seconds (0 = wait forever)
    metadata={"request_id": "REQ-123", "approver": "admin@example.com"}
)
```

### WaitNode Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `wait_reason` | `str` | "Waiting for external input" | Human-readable reason for the wait |
| `timeout_seconds` | `int` | `0` | Timeout in seconds (0 = wait indefinitely) |
| `metadata` | `dict` | `{}` | Additional metadata to include with suspension |

### WaitNode Output

When resumed, the WaitNode outputs:

```python
{
    "data": {...},           # Data provided during resume
    "resumed_at": "...",     # ISO timestamp of resumption
    "waited_seconds": 30.5,  # How long the workflow was suspended
    "reason": "..."          # The wait reason
}
```

---

## Creating Custom Suspendable Nodes

For more control, create your own suspendable node by extending `SuspendableNode`:

```python
from nodetool.workflows.suspendable_node import SuspendableNode
from nodetool.workflows.processing_context import ProcessingContext

class ApprovalNode(SuspendableNode):
    """Node that waits for external approval."""
    
    document_id: str = ""
    
    async def process(self, context: ProcessingContext) -> dict:
        # Check if resuming from suspension
        if self.is_resuming():
            saved_state = await self.get_saved_state()
            
            if saved_state.get('approved'):
                return {
                    'status': 'approved',
                    'approved_by': saved_state.get('approved_by'),
                    'approved_at': saved_state.get('approved_at'),
                }
            else:
                return {
                    'status': 'rejected',
                    'reason': saved_state.get('rejection_reason'),
                }
        
        # First execution - suspend and wait for approval
        await self.suspend_workflow(
            reason=f"Waiting for approval of document {self.document_id}",
            state={
                'document_id': self.document_id,
                'submitted_at': datetime.now().isoformat(),
            },
            metadata={
                'approver_email': 'admin@example.com',
                'timeout_hours': 24,
            }
        )
        
        # Execution never reaches here on first run
        # The suspend_workflow() call raises an exception
```

---

## API Methods

### SuspendableNode Methods

#### `is_suspendable() -> bool`

Returns `True` to indicate this node supports suspension.

#### `is_resuming() -> bool`

Check if the node is resuming from a previous suspension.

```python
if self.is_resuming():
    # Resumption path - get saved state
    saved = await self.get_saved_state()
else:
    # First execution path - suspend
    await self.suspend_workflow(...)
```

#### `async get_saved_state() -> dict`

Get the state that was saved when workflow suspended.

```python
saved_state = await self.get_saved_state()
approval_status = saved_state.get('approved', False)
```

Raises `ValueError` if called when not resuming.

#### `async suspend_workflow(reason, state, metadata=None)`

Suspend workflow execution and save state.

```python
await self.suspend_workflow(
    reason="Waiting for user input",
    state={'partial_result': computed_value},
    metadata={'timeout': 3600}
)
```

This method:

- Logs `NodeSuspended` event with state
- Logs `RunSuspended` event
- Raises `WorkflowSuspendedException` to exit execution
- Never returns (workflow is suspended)

---

## Suspension Flow

### 1. Initial Execution

```
WorkflowRunner.run()
  ├─> NodeActor executes node
  ├─> node.process() calls suspend_workflow()
  ├─> WorkflowSuspendedException raised
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
  ├─> Sets node._set_resuming_state()
  └─> WorkflowRunner.run() continues
```

### 3. Node Resumption

```
NodeActor executes node (resuming=True)
  ├─> node.is_resuming() returns True
  ├─> node.get_saved_state() returns saved state
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

1. **Always check `is_resuming()`** - Handle both first execution and resumption paths
2. **Save minimal state** - Only save what's needed to resume
3. **Use descriptive reasons** - Make suspension reason clear for users
4. **Add metadata** - Include context like timeout, approver email, etc.
5. **Handle timeouts** - Consider what happens if workflow isn't resumed
6. **Test both paths** - Test both suspension and resumption code

---

## Example: Webhook Callback

```python
class WebhookWaitNode(SuspendableNode):
    """Wait for a webhook callback before continuing."""
    
    callback_url: str = ""
    
    async def process(self, context: ProcessingContext) -> dict:
        if self.is_resuming():
            state = await self.get_saved_state()
            return {
                'webhook_id': state['webhook_id'],
                'callback_data': state.get('callback_data', {}),
            }
        
        # Register webhook and get ID
        webhook_id = await register_webhook(self.callback_url)
        
        # Suspend until webhook is called
        await self.suspend_workflow(
            reason=f"Waiting for webhook callback",
            state={'webhook_id': webhook_id, 'callback_url': self.callback_url},
            metadata={'external_service': True}
        )
```

---

## See Also

- [Workflow Editor](../workflow-editor.md) - User guide for pause/resume controls
- [Trigger Nodes](node-patterns.md#trigger-nodes) - Nodes that fire on external events
- [Workflow API](../workflow-api.md) - API endpoints for workflow control
