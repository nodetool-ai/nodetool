# nodetool.dsl.graph

## GraphNode

Represents a node in a graph DSL.

- **id** (str)

### graph

Create a graph representation based on the given nodes.


**Args:**

- ***nodes**: Variable number of nodes to be included in the graph.


**Returns:**

- **Graph**: A graph object containing the nodes and edges.
### run

Run the workflow with the given graph.


**Args:**

- **graph (Graph)**: The graph object representing the workflow.


**Returns:**

- **Any**: The result of the workflow execution.
