# nodetool.common.websocket_runner

## CommandType

## WebSocketCommand

**Fields:**
- **command** (CommandType)
- **data** (dict)


## WebSocketMode

## WebSocketRunner

Runs a workflow using a WebSocket connection.
Attributes:
websocket (WebSocket | None): The WebSocket connection.
context (ProcessingContext | None): The processing context for job execution.
job_id (str | None): The ID of the current job.
runner (WorkflowRunner | None): The workflow runner for job execution.
mode (WebSocketMode): The current mode for WebSocket communication.

**Tags:** 

### execute_workflow

Execute a workflow with the given context and request.


**Args:**

- **context (ProcessingContext)**: The processing context
- **runner (WorkflowRunner)**: The workflow runner
- **req (RunJobRequest)**: The job request
**Args:**
- **context (ProcessingContext)**
- **runner (WorkflowRunner)**
- **req (RunJobRequest)**

### process_message

Helper method to process and send individual messages.
Yields the message to the caller.


**Args:**

- **context (ProcessingContext)**: The processing context
- **req (RunJobRequest)**: The request object for the job.
**Args:**
- **context (ProcessingContext)**
- **explicit_types (bool) (default: False)**

### process_workflow_messages

Process messages from a running workflow.


**Args:**

- **context (ProcessingContext)**: The processing context
- **runner (WorkflowRunner)**: The workflow runner
- **message_handler**: Async function to handle messages
- **sleep_interval (float)**: Time to sleep between message checks
- **explicit_types (bool)**: Whether to wrap primitive types in explicit types
**Args:**
- **context (ProcessingContext)**
- **runner (WorkflowRunner)**
- **sleep_interval (float) (default: 0.01)**
- **explicit_types (bool) (default: False)**

**Returns:** typing.AsyncGenerator[dict, NoneType]

