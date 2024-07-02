# nodetool.dsl.graph

## GraphNode

Represents a node in a graph DSL.

**Inherits from:** BaseModel

- **id** (`str`)

## Function: `graph(*nodes)`

Create a graph representation based on the given nodes.

    Args:
      *nodes: Variable number of nodes to be included in the graph.

    Returns:
      Graph: A graph object containing the nodes and edges.

**Parameters:**

- `nodes`

## Function: `run(graph: nodetool.api.types.graph.Graph, user_id: str = '1', auth_token: str = 'token')`

Run the workflow with the given graph.

    Args:
      graph (Graph): The graph object representing the workflow.

    Returns:
      Any: The result of the workflow execution.

**Parameters:**

- `graph` (Graph)
- `user_id` (str) (default: `1`)
- `auth_token` (str) (default: `token`)

