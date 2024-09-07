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

### get_available_vram

