# nodetool.workflows.graph

## Graph

This class represents a graph data structure containing nodes and edges.
in terms of handling subgraphs and their connections.

**Tags:** It supports operations to manipulate and transform the graph, particularly

**Inherits from:** BaseModel

- **nodes** (`list[nodetool.workflows.base_node.BaseNode]`)
- **edges** (`list[nodetool.api.types.graph.Edge]`)

#### `build_sub_graphs(self)`

This method organizes nodes into their respective subgraphs based on the
        group node they belong to and reconnects the edges accordingly. It also
        ensures that only nodes that are not part of any group remain in the
        main graph node list after the subgraphs are formed.

        Process:
        1. Identify Group Nodes: It first identifies all nodes that are
        instances of GroupNode .
        2. Assign Children to Groups: Each node is checked if it belongs
        to a group (i.e., if its parent_id is in the dictionary of group nodes).
        If so, it is added to the corresponding group node.
        3. Reconnect Edges: reassigns the edges to connect to the group nodes
        instead of the child nodes.

**Parameters:**


#### `find_node(self, node_id: str) -> nodetool.workflows.base_node.BaseNode | None`

Find a node by its id.

**Parameters:**

- `node_id` (str)

**Returns:** `nodetool.workflows.base_node.BaseNode | None`

#### `get_input_schema(self)`

Returns a JSON schema for input nodes of the graph.

**Parameters:**


#### `get_output_schema(self)`

Returns a JSON schema for the output nodes of the graph.

**Parameters:**


#### `inputs(self) -> List[nodetool.workflows.base_node.InputNode]`

Returns a list of nodes that inherit from InputNode.

**Parameters:**


**Returns:** `typing.List[nodetool.workflows.base_node.InputNode]`

#### `outputs(self) -> List[nodetool.workflows.base_node.OutputNode]`

Returns a list of nodes that have no outgoing edges.

**Parameters:**


**Returns:** `typing.List[nodetool.workflows.base_node.OutputNode]`

#### `reconnect_edges(self, group_nodes: dict[str, nodetool.workflows.base_node.GroupNode])`

Revises the graph's edge connections after nodes have been structured
        into groups.

        Process:
        1. Create a new list of edges.
        2. For each edge in the original list, check if the source or target
        nodes are part of a group. If they are, the edge is updated to connect
        to the group node instead. They must be either Group Input or Group
        Output nodes.
        3. If both the source and target nodes are part of the same group, the
        edge is added to that group.
        4. If source and target nodes are part of different groups, the edge is

**Parameters:**

- `group_nodes` (dict[str, nodetool.workflows.base_node.GroupNode])

## Function: `any_type_in_union(union_type: nodetool.metadata.type_metadata.TypeMetadata, other_type: nodetool.metadata.type_metadata.TypeMetadata)`

Matches a union type and another type.

    For example, if the union type is `Union[int, float]` and the other type is `int`, this function will return True.

**Parameters:**

- `union_type` (TypeMetadata)
- `other_type` (TypeMetadata)

## Function: `is_connectable(source: nodetool.metadata.type_metadata.TypeMetadata, target: nodetool.metadata.type_metadata.TypeMetadata) -> bool`

Returns true if the type

**Parameters:**

- `source` (TypeMetadata)
- `target` (TypeMetadata)

**Returns:** `bool`

## Function: `topological_sort(edges: list[nodetool.api.types.graph.Edge], nodes: list[nodetool.workflows.base_node.BaseNode]) -> List[List[str]]`

Sorts the graph topologically.

    This function is based on the Kahn's algorithm.

    It works like this:
    1. Find all nodes with no incoming edges and add them to a queue.
    2. While the queue is not empty:
        1. Remove a node from the queue and add it to the sorted list.
        2. Remove all outgoing edges from the node.
        3. If any of the nodes that the edges point to have no incoming edges, add them to the queue.

    Returns a list of lists, where each list contains the nodes that are on the same level.
    This is useful for parallelizing the execution of the graph.

**Parameters:**

- `edges` (list[nodetool.api.types.graph.Edge])
- `nodes` (list[nodetool.workflows.base_node.BaseNode])

**Returns:** `typing.List[typing.List[str]]`

