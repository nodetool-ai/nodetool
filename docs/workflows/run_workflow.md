# nodetool.workflows.run_workflow

### run_workflow

Runs a workflow asynchronously, with the option to run in a separate thread.


**Args:**

- **req (RunJobRequest)**: The request object containing the necessary information for running the workflow.
- **runner (WorkflowRunner | None)**: The workflow runner object. If not provided, a new instance will be created.
- **context (ProcessingContext | None)**: The processing context object. If not provided, a new instance will be created.
- **use_thread (bool)**: Whether to run the workflow in a separate thread. Defaults to False.


**Yields:**

- **Any**: A generator that yields job updates and messages from the workflow.


**Raises:**

- **Exception**: If an error occurs during the execution of the workflow.


**Returns:**

- **AsyncGenerator[Any, None]**: An asynchronous generator that yields job updates and messages from the workflow.
**Args:**
- **req (RunJobRequest)**
- **runner (nodetool.workflows.workflow_runner.WorkflowRunner | None) (default: None)**
- **context (nodetool.workflows.processing_context.ProcessingContext | None) (default: None)**
- **use_thread (bool) (default: False)**

**Returns:** typing.AsyncGenerator[typing.Any, NoneType]

