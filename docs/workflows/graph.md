# nodetool.workflows.graph

## Graph

Represents a graph data structure for workflow management and analysis.
This class encapsulates the functionality for creating, manipulating, and analyzing
directed graphs, particularly in the context of workflow systems. It provides methods
for managing nodes and edges, identifying input and output nodes, generating schemas,
and performing topological sorting.

Key features:
- Node and edge management
- Input and output node identification
- JSON schema generation for inputs and outputs
- Topological sorting of nodes

The Graph class is designed to support various operations on workflow graphs,
including dependency analysis, execution order determination, and subgraph handling.
It is particularly useful for systems that need to represent and process complex,
interconnected workflows or data pipelines.

Attributes:
nodes (list[BaseNode]): A list of nodes in the graph.
edges (list[Edge]): A list of edges connecting the nodes.

Methods:
find_node: Locates a node by its ID.
from_dict: Creates a Graph instance from a dictionary representation.
inputs: Returns a list of input nodes.
outputs: Returns a list of output nodes.
get_input_schema: Generates a JSON schema for the graph's inputs.
get_output_schema: Generates a JSON schema for the graph's outputs.
topological_sort: Performs a topological sort on the graph's nodes.

The class leverages Pydantic for data validation and serialization, making it
robust for use in larger systems that require strict type checking and easy
integration with APIs or databases.

**Tags:** 

- **nodes** (typing.Sequence[nodetool.workflows.base_node.BaseNode])
- **edges** (typing.Sequence[nodetool.types.graph.Edge])

### find_node

Find a node by its id.
**Args:**
- **node_id (str)**

**Returns:** nodetool.workflows.base_node.BaseNode | None

### get_input_schema

Returns a JSON schema for input nodes of the graph.
**Args:**

### get_output_schema

Returns a JSON schema for the output nodes of the graph.
**Args:**

### inputs

Returns a list of nodes that inherit from InputNode.
**Args:**

**Returns:** typing.List[nodetool.workflows.base_node.InputNode]

### outputs

Returns a list of nodes that have no outgoing edges.
**Args:**

**Returns:** typing.List[nodetool.workflows.base_node.OutputNode]

### topological_sort

Perform a topological sort on the graph, grouping nodes by levels.

This method implements a modified version of Kahn's algorithm for topological sorting.
It sorts the nodes of the graph into levels, where each level contains nodes
that can be processed in parallel.


**Args:**

- **parent_id (str | None, optional)**: The ID of the parent node to filter results. Defaults to None.


**Returns:**

- **List[List[str]]**: A list of lists, where each inner list contains the node IDs at the same level
in the topological order. Nodes in the same list can be processed in parallel.


**Notes:**


- The method does not modify the original graph structure.
- Nodes are only included in the output if their parent_id matches the given parent_id.
- If a cycle exists, some nodes may be omitted from the result.
