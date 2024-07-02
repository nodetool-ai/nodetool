# nodetool.workflows.base_node

## BaseNode

A node is a single unit of computation in a graph.
Each node class implements its own processing function,
which is called when the node is evaluated.

**Tags:** It has a unique ID and a type.

**Inherits from:** BaseModel


#### `assign_property(self, name: str, value: Any)`

Sets the value of a property.

**Parameters:**

- `name` (str)
- `value` (Any)

#### `convert_output(self, context: Any, output: Any) -> Any`

**Parameters:**

- `context` (Any)
- `output` (Any)

**Returns:** `Any`

#### `from_dict(node: dict[str, typing.Any], skip_errors: bool = False) -> 'BaseNode'`

Create a Node object from a dictionary representation.

        Args:
            node (dict[str, Any]): The dictionary representing the Node.

        Returns:
            Node: The created Node object.

**Parameters:**

- `node` (dict[str, typing.Any])
- `skip_errors` (bool) (default: `False`)

**Returns:** `BaseNode`

#### `has_parent(self)`

**Parameters:**


#### `node_properties(self)`

**Parameters:**


#### `pre_process(self, context: Any) -> Any`

Pre-process the node before processing.
        This will be called before cache key is computed.
        Default implementation generates a seed for any field named seed.

**Parameters:**

- `context` (Any)

**Returns:** `Any`

#### `set_node_properties(self, properties: dict[str, typing.Any], skip_errors: bool = False)`

Sets the values of multiple properties.

**Parameters:**

- `properties` (dict[str, typing.Any])
- `skip_errors` (bool) (default: `False`)

## Comment

**Inherits from:** BaseNode

- **comment**: The comment for this node. (`list[typing.Any]`)

## GroupNode

A group node is a special type of node that contains a subgraph.

**Inherits from:** BaseNode


#### `append_edge(self, edge: nodetool.api.types.graph.Edge)`

**Parameters:**

- `edge` (Edge)

#### `append_node(self, node: nodetool.workflows.base_node.BaseNode)`

**Parameters:**

- `node` (BaseNode)

#### `assign_property(self, name: str, value: Any)`

**Parameters:**

- `name` (str)
- `value` (Any)

#### `process_subgraph(self, context: Any, runner: Any)`

**Parameters:**

- `context` (Any)
- `runner` (Any)

## InputNode

**Inherits from:** BaseNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)

## OutputNode

**Inherits from:** BaseNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)

## Preview

A preview node is a special type of node that is used to preview the output of a node.

**Inherits from:** BaseNode

- **value**: The value to preview. (`Any`)

## Function: `add_node_classname(node_class: type['BaseNode']) -> None`

**Parameters:**

- `node_class` (type['BaseNode'])

**Returns:** `None`

## Function: `add_node_type(node_class: type['BaseNode']) -> None`

Add a node type to the registry.

    Args:
        node_type (str): The node_type of the node.
        node_class (type[Node]): The class of the node.

**Parameters:**

- `node_class` (type['BaseNode'])

**Returns:** `None`

## Function: `get_node_class(node_type: str) -> type[nodetool.workflows.base_node.BaseNode] | None`

Get the type of a node based on its node_type.

    Args:
        node_type (str): The node_type of the node.

    Returns:
        type[Node] | None: The type of the node or None if it does not exist.

**Parameters:**

- `node_type` (str)

**Returns:** `type[nodetool.workflows.base_node.BaseNode] | None`

## Function: `get_node_class_by_name(class_name: str) -> list[type[nodetool.workflows.base_node.BaseNode]]`

Get the class of a node based on its class_name.

    Args:
        class_name (str): The class_name of the node.

    Returns:
        list[type[Node]]: The classes matching the name.

**Parameters:**

- `class_name` (str)

**Returns:** `list[type[nodetool.workflows.base_node.BaseNode]]`

## Function: `get_registered_node_classes() -> list[type[nodetool.workflows.base_node.BaseNode]]`

Get all registered node classes.

    Returns:
        list[type[Node]]: The registered node classes.

**Returns:** `list[type[nodetool.workflows.base_node.BaseNode]]`

## Function: `requires_capabilities(nodes: list[nodetool.workflows.base_node.BaseNode])`

**Parameters:**

- `nodes` (list[nodetool.workflows.base_node.BaseNode])

## Function: `requires_capabilities_from_request(req: nodetool.workflows.run_job_request.RunJobRequest)`

**Parameters:**

- `req` (RunJobRequest)

## Function: `type_metadata(python_type: Union[Type, types.UnionType]) -> nodetool.metadata.type_metadata.TypeMetadata`

Returns the metadata for a type.

**Parameters:**

- `python_type` (typing.Union[typing.Type, types.UnionType])

**Returns:** `TypeMetadata`

