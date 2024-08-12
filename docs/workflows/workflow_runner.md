# nodetool.workflows.workflow_runner

## WorkflowRunner

Executes a directed acyclic graph (DAG) of computational nodes with parallel processing and result caching.
Key Features:
1. Topological Execution: Processes nodes in an order that respects their dependencies.
2. Parallel Processing: Executes independent nodes concurrently within each topological level.
3. Result Caching: Stores and retrieves node outputs to optimize repeated executions.
4. Special Node Handling: Supports both regular nodes and GroupNodes (e.g., loop nodes).
5. Resource Management: Allocates appropriate computational resources (e.g., GPU) based on node requirements.
6. Progress Tracking: Provides real-time updates on individual node and overall workflow status.
7. Error Handling: Captures and reports exceptions during node execution.
8. Cancellation Support: Allows for immediate termination of the workflow execution.

Attributes:
job_id (str): Unique identifier for the current workflow execution.
status (str): Current state of the workflow. Possible values: "running", "completed", "cancelled", "error".
is_cancelled (bool): Flag indicating whether the job has been manually cancelled.
current_node (Optional[str]): Identifier of the node currently being processed, or None if no node is active.

Note:
- This class does not handle the definition of the workflow graph. The graph must be provided externally.
- The class relies on an external ProcessingContext for managing execution state and inter-node communication.

**Tags:** 

### cancel

Marks the workflow for cancellation.


**Post-conditions:**


- Sets status to "cancelled".
- Sets is_cancelled to True.


**Note:**

This method does not immediately stop execution. The cancellation is checked
and acted upon at specific points during the workflow execution.
**Args:**

**Returns:** None

### initialize_graph

Initializes all nodes in the graph.


**Args:**

- **context (ProcessingContext)**: Manages the execution state and inter-node communication.
- **graph (Graph)**: The directed acyclic graph of nodes to be processed.


**Raises:**

- **Exception**: Any exception raised during node initialization is caught and reported.
**Args:**
- **context (ProcessingContext)**
- **graph (Graph)**

### is_running

Checks if the workflow is currently in the running state.


**Returns:**

- **bool**: True if the workflow status is "running", False otherwise.
**Args:**

**Returns:** bool

### process_graph

Processes the graph by executing nodes in topological order with parallel execution at each level.


**Args:**

- **context (ProcessingContext)**: Manages the execution state and inter-node communication.
- **graph (Graph)**: The directed acyclic graph of nodes to be processed.
- **parent_id (str | None)**: Identifier of the parent node, if this is a subgraph. Defaults to None.


**Note:**


- Uses topological sorting to determine the execution order.
- Executes nodes at each level in parallel using asyncio.gather.
- Checks for cancellation before processing each level.
**Args:**
- **context (ProcessingContext)**
- **graph (Graph)**
- **parent_id (str | None) (default: None)**

### process_node

Processes a single node in the workflow graph.


**Args:**

- **context (ProcessingContext)**: Manages the execution state and inter-node communication.
- **node (BaseNode)**: The node to be processed.


**Raises:**

- **JobCancelledException**: If the job is cancelled during node processing.


**Note:**


- Skips nodes that have already been processed in a subgraph.
- Handles special processing for GroupNodes.
- Posts node status updates (running, completed, error) to the context.
**Args:**
- **context (ProcessingContext)**
- **node (BaseNode)**

### process_regular_node

Processes a regular (non-GroupNode) node in the workflow.


**Args:**

- **context (ProcessingContext)**: Manages the execution state and inter-node communication.
- **node (BaseNode)**: The node to be processed.


**Raises:**

- **Exception**: Any exception raised during node processing is caught and reported.


**Post-conditions:**


- Node inputs are collected and assigned.
- Node is processed.
- Node output is converted.
- Node result is cached if applicable.
- Node status updates are posted to the context.
- Node is marked as processed in the context.


**Note:**


- Handles result caching and retrieval.
- Manages timing information for node execution.
- Prepares and posts detailed node updates including properties and results.
**Args:**
- **context (ProcessingContext)**
- **node (BaseNode)**

### process_subgraph

Processes a subgraph contained within a GroupNode.


**Args:**

- **context (ProcessingContext)**: Manages the execution state and inter-node communication.
- **group_node (GroupNode)**: The GroupNode containing the subgraph.
- **inputs (dict[str, Any])**: Input data for the subgraph.


**Returns:**

- **Any**: The result of the subgraph execution.


**Raises:**

- **ValueError**: If the GroupNode has no input nodes or if the input data is invalid.


**Note:**


- Handles special input types like DataframeRef.
- Executes the subgraph for each item in the input data.
- Collects and returns results from output nodes.
- Marks all nodes in the subgraph as processed.
**Args:**
- **context (ProcessingContext)**
- **group_node (GroupNode)**
- **inputs (dict)**

**Returns:** typing.Any

### run

Executes the entire workflow based on the provided request and context.


**Args:**

- **req (RunJobRequest)**: Contains the workflow graph and input parameters.
- **context (ProcessingContext)**: Manages the execution state and inter-node communication.


**Raises:**

- **ValueError**: If the graph is missing or if there's a mismatch between input parameters and graph input nodes.
- **JobCancelledException**: If the job is cancelled during execution.


**Post-conditions:**


- Updates workflow status to "completed", "cancelled", or "error".
- Posts final JobUpdate message with results or cancellation status.


**Note:**


- Handles input validation, graph processing, and output collection.
- Manages GPU resources if required by the workflow.
**Args:**
- **req (RunJobRequest)**
- **context (ProcessingContext)**

**Returns:** None

### run_group_node

Executes a GroupNode, which represents a subgraph within the main workflow.


**Args:**

- **group_node (GroupNode)**: The GroupNode to be executed.
- **context (ProcessingContext)**: Manages the execution state and inter-node communication.


**Post-conditions:**


- Processes the subgraph contained within the GroupNode.
- Stores the result of the GroupNode execution in the context.
- Marks the GroupNode as processed in the context.


**Note:**


- Retrieves inputs for the GroupNode from the context.
- Calls process_subgraph to handle the execution of the subgraph.
**Args:**
- **group_node (GroupNode)**
- **context (ProcessingContext)**

### torch_context

Context manager for handling GPU tasks.


**Args:**

- **context (ProcessingContext)**: Manages the execution state and inter-node communication.


**Note:**


- Sets up progress tracking hooks for ComfyUI operations.
- Manages CUDA memory and PyTorch inference mode.
- Cleans up models and CUDA cache after execution.
**Args:**
- **context (ProcessingContext)**

