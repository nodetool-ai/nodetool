# nodetool.workflows.base_node

## BaseNode

A node is a single unit of computation in a graph.
Each node class implements its own processing function,
which is called when the node is evaluated.

**Tags:** It has a unique ID and a type.


#### `assign_property`

Sets the value of a property.

**Parameters:**

- `name` (str)
- `value` (Any)

#### `convert_output`

**Parameters:**

- `context` (Any)
- `output` (Any)

**Returns:** `Any`

#### `from_dict`

Create a Node object from a dictionary representation.

        Args:
            node (dict[str, Any]): The dictionary representing the Node.

        Returns:
            Node: The created Node object.

**Parameters:**

- `node` (dict[str, typing.Any])
- `skip_errors` (bool) (default: `False`)

**Returns:** `BaseNode`

#### `has_parent`

**Parameters:**


#### `node_properties`

**Parameters:**


#### `pre_process`

Pre-process the node before processing.
        This will be called before cache key is computed.
        Default implementation generates a seed for any field named seed.

**Parameters:**

- `context` (Any)

**Returns:** `Any`

#### `set_node_properties`

Sets the values of multiple properties.

**Parameters:**

- `properties` (dict[str, typing.Any])
- `skip_errors` (bool) (default: `False`)

## Comment

- **comment**: The comment for this node. (`list[typing.Any]`)

## GroupNode

A group node is a special type of node that contains a subgraph.


#### `append_edge`

**Parameters:**

- `edge` (Edge)

#### `append_node`

**Parameters:**

- `node` (BaseNode)

#### `assign_property`

**Parameters:**

- `name` (str)
- `value` (Any)

#### `process_subgraph`

**Parameters:**

- `context` (Any)
- `runner` (Any)

## InputNode

- **label**: The label for this input node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this input node. (`str`)

## OutputNode

- **label**: The label for this output node. (`str`)
- **name**: The parameter name for the workflow. (`str`)
- **description**: The description for this output node. (`str`)

## Preview

A preview node is a special type of node that is used to preview the output of a node.

- **value**: The value to preview. (`Any`)

#### `add_node_classname`

**Parameters:**

- `node_class` (type['BaseNode'])

**Returns:** `None`

#### `add_node_type`

Add a node type to the registry.

    Args:
        node_type (str): The node_type of the node.
        node_class (type[Node]): The class of the node.

**Parameters:**

- `node_class` (type['BaseNode'])

**Returns:** `None`

#### `get_node_class`

Get the type of a node based on its node_type.

    Args:
        node_type (str): The node_type of the node.

    Returns:
        type[Node] | None: The type of the node or None if it does not exist.

**Parameters:**

- `node_type` (str)

**Returns:** `type[nodetool.workflows.base_node.BaseNode] | None`

#### `get_node_class_by_name`

Get the class of a node based on its class_name.

    Args:
        class_name (str): The class_name of the node.

    Returns:
        list[type[Node]]: The classes matching the name.

**Parameters:**

- `class_name` (str)

**Returns:** `list[type[nodetool.workflows.base_node.BaseNode]]`

#### `get_registered_node_classes`

Get all registered node classes.

    Returns:
        list[type[Node]]: The registered node classes.

**Returns:** `list[type[nodetool.workflows.base_node.BaseNode]]`

#### `requires_capabilities`

**Parameters:**

- `nodes` (list[nodetool.workflows.base_node.BaseNode])

#### `requires_capabilities_from_request`

**Parameters:**

- `req` (RunJobRequest)

#### `type_metadata`

Returns the metadata for a type.

**Parameters:**

- `python_type` (typing.Union[typing.Type, types.UnionType])

**Returns:** `TypeMetadata`

