# nodetool.workflows.workflow_runner

## WorkflowRunner

Executes a graph of nodes in topological order with parallel processing and result caching.
The WorkflowRunner is responsible for orchestrating the execution of a workflow,
which is represented as a graph of interconnected nodes. It provides the following
key functionalities:

1. Graph Execution:
- Processes nodes in topological order to ensure dependencies are met.
- Executes nodes asynchronously in parallel at each graph level for improved performance.

2. Execution Management:
- Manages the overall execution context, including input/output handling and result collection.
- Supports job cancellation, allowing for graceful termination of running workflows.

3. Node Handling:
- Processes regular nodes and special node types like GroupNodes (e.g., loop nodes).
- Utilizes a caching mechanism to store and retrieve node results, improving efficiency
for repeated operations.

4. Resource Management:
- Handles capabilities required by the workflow, such as GPU support for ComfyUI nodes.
- Manages execution on appropriate workers based on workflow requirements (e.g., GPU-intensive tasks).

5. Progress Tracking and Reporting:
- Provides updates on node execution status and overall workflow progress.
- Reports errors and exceptions occurring during node execution.

The WorkflowRunner uses a NodeCache to store results across multiple workflow runs,
optimizing performance for repeated node executions with identical inputs and configurations.

Attributes:
job_id (str): Unique identifier for the current job.
status (str): Current status of the workflow execution (e.g., "running", "completed", "cancelled").
is_cancelled (bool): Flag indicating whether the job has been cancelled.
current_node (Optional[str]): Identifier of the node currently being processed.
cache (NodeCache): Instance of NodeCache used for storing and retrieving node results.

Note:
GPU-intensive workflows are automatically directed to appropriate workers with GPU capabilities.

**Tags:** 

#### `cancel`

**Parameters:**


**Returns:** `None`

#### `is_running`

**Parameters:**


**Returns:** `bool`

#### `prepare_result_for_update`

Prepare the result for the NodeUpdate message.

**Parameters:**

- `result` (typing.Dict[str, typing.Any])
- `node` (BaseNode)

**Returns:** `typing.Dict[str, typing.Any]`

#### `process_graph`

Process the graph in a topological order, executing each node in parallel.

        Args:
            context (ProcessingContext): The processing context containing the graph, edges, and nodes.
            graph (Graph): The graph to be processed.

        Returns:
            None

**Parameters:**

- `context` (ProcessingContext)
- `graph` (Graph)

#### `process_node`

Process a node in the workflow.
        Skip nodes that have already been processed.
        Checks for special types of nodes, such as loop nodes.

        Args:
            context (ProcessingContext): The processing context.
            node (Node): The node to be processed.

        Returns:
            None

**Parameters:**

- `context` (ProcessingContext)
- `node` (BaseNode)

#### `process_regular_node`

Processes a single node in the graph.

        This will get all the results from the input nodes and assign
        them to the properties of the node. Then the node is processed
        and the result is stored in the context's results dictionary.

        Once the node is processed, it is added to the completed_tasks set.

**Parameters:**

- `context` (ProcessingContext)
- `node` (BaseNode)

#### `run`

**Parameters:**

- `req` (RunJobRequest)
- `context` (ProcessingContext)

**Returns:** `None`

#### `run_group_node`

Find all nodes from the subgraph of the loop node and pass it to
        the loop node for processing.

**Parameters:**

- `group_node` (GroupNode)
- `context` (ProcessingContext)

#### `torch_capabilities`

**Parameters:**

- `capabilities` (list[str])
- `context` (ProcessingContext)

