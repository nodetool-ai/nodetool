# nodetool.workflows.base_node

## BaseNode

The foundational class for all nodes in the workflow graph.
Attributes:
_id (str): Unique identifier for the node.
_parent_id (str | None): Identifier of the parent node, if any.
_ui_properties (dict[str, Any]): UI-specific properties for the node.
_visible (bool): Whether the node is visible in the UI.
_layout (str): The layout style for the node in the UI.

Methods:
Includes methods for initialization, property management, metadata generation,
type checking, and node processing.

**Tags:** 

**Fields:**

### assign_property

Assign a value to a node property, performing type checking and conversion.


**Args:**

- **name (str)**: The name of the property to assign.
- **value (Any)**: The value to assign to the property.


**Raises:**

- **ValueError**: If the value is not assignable to the property type.


**Note:**

This method handles type conversion for enums, lists, and objects with 'model_validate' method.
**Args:**
- **name (str)**
- **value (typing.Any)**

### convert_output

**Args:**
- **context (typing.Any)**
- **output (typing.Any)**

**Returns:** typing.Any

### finalize

Finalizes the workflow by performing any necessary cleanup or post-processing tasks.

This method is called when the workflow is shutting down.
It's responsible for cleaning up resources, unloading GPU models, and performing any necessary teardown operations.
**Args:**
- **context**

### from_dict

Create a Node object from a dictionary representation.


**Args:**

- **node (dict[str, Any])**: The dictionary representing the Node.


**Returns:**

- **Node**: The created Node object.
**Args:**
- **node (dict)**
- **skip_errors (bool) (default: False)**

**Returns:** BaseNode

### get_properties_for_update

Includes all properties in the update message.
**Args:**
- **names (list)**

### has_parent

**Args:**

### initialize

Initialize the node when workflow starts.

Responsible for setting up the node, including loading any necessary GPU models.
**Args:**
- **context (typing.Any)**

### move_to_device

Move the node to a specific device, "cpu", "cuda" or "mps".


**Args:**

- **device (str)**: The device to move the node to.
**Args:**
- **device (str)**

### node_properties

**Args:**

### pre_process

Pre-process the node before processing.
This will be called before cache key is computed.
Default implementation generates a seed for any field named seed.
**Args:**
- **context (typing.Any)**

**Returns:** typing.Any

### properties_for_client

Properties to send to the client for updating the node.
Comfy types and tensors are excluded.
**Args:**

### required_inputs

**Args:**

### result_for_all_outputs

Prepares the node result for inclusion in a NodeUpdate message.

This method is used when the node is sending updates for all outputs.
**Args:**
- **result (dict)**

**Returns:** dict

### result_for_client

Prepares the node result for inclusion in a NodeUpdate message.


**Args:**

- **result (Dict[str, Any])**: The raw result from node processing.


**Returns:**

- **Dict[str, Any]**: A modified version of the result suitable for status updates.


**Note:**


- Converts Pydantic models to dictionaries.
- Serializes binary data to base64.
**Args:**
- **result (dict)**

**Returns:** dict

### send_update

Send a status update for the node to the client.


**Args:**

- **context (Any)**: The context in which the node is being processed.
- **status (str)**: The status of the node.
- **result (dict[str, Any], optional)**: The result of the node's processing. Defaults to {}.
**Args:**
- **context (typing.Any)**
- **status (str)**
- **result (dict[str, typing.Any] | None) (default: None)**

### set_node_properties

Set multiple node properties at once.


**Args:**

- **properties (dict[str, Any])**: A dictionary of property names and their values.
- **skip_errors (bool, optional)**: If True, continue setting properties even if an error occurs. Defaults to False.


**Raises:**

- **ValueError**: If skip_errors is False and an error occurs while setting a property.


**Note:**

Errors during property assignment are printed regardless of the skip_errors flag.
**Args:**
- **properties (dict)**
- **skip_errors (bool) (default: False)**

### to_dict

**Args:**

**Returns:** dict

### validate

Validate the node's inputs before processing.


**Args:**

- **input_edges (list[Edge])**: The edges connected to the node's inputs.


**Raises:**

- **ValueError**: If any input is missing or invalid.
**Args:**
- **input_edges (list)**


## Comment

A utility node for adding comments or annotations to the workflow graph.
Attributes:
comment (list[Any]): The content of the comment, stored as a list of elements.

**Tags:** 

**Fields:**
- **headline**: The headline for this comment. (str)
- **comment**: The comment for this node. (list)
- **comment_color**: The color for the comment. (str)


## GroupNode

A special node type that can contain a subgraph of nodes.
This node type allows for hierarchical structuring of workflows.

**Tags:** 

**Fields:**


## InputNode

A special node type representing an input to the workflow.
Attributes:
label (str): A human-readable label for the input.
name (str): The parameter name for this input in the workflow.
description (str): A detailed description of the input.

**Tags:** 

**Fields:**
- **label**: The label for this input node. (str)
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this input node. (str)


## OutputNode

A special node type representing an output from the workflow.
Attributes:
label (str): A human-readable label for the output.
name (str): The parameter name for this output in the workflow.
description (str): A detailed description of the output.

**Tags:** 

**Fields:**
- **label**: The label for this output node. (str)
- **name**: The parameter name for the workflow. (str)
- **description**: The description for this output node. (str)

### result_for_client

**Args:**
- **result (dict)**

**Returns:** dict


## Preview

A utility node for previewing data within the workflow graph.
Attributes:
value (Any): The value to be previewed.

**Tags:** 

**Fields:**
- **value**: The value to preview. (typing.Any)
- **name**: The name of the preview node. (str)

### result_for_client

**Args:**
- **result (dict)**

**Returns:** dict


### add_comfy_classname

Register a comfy node class by its class name in the NODES_BY_CLASSNAME dictionary.
To avoid name conflicts, we store comfy classes in a separate dictionary.


**Args:**

- **node_class (type["BaseNode"])**: The node class to be registered.


**Note:**

If the node class has a 'comfy_class' attribute, it uses that as the class name.
Otherwise, it uses the actual class name.
**Args:**
- **node_class (type)**

**Returns:** None

### add_node_type

Add a node type to the registry.


**Args:**

- **node_type (str)**: The node_type of the node.
- **node_class (type[Node])**: The class of the node.
**Args:**
- **node_class (type)**

**Returns:** None

### find_node_class_by_name

**Args:**
- **class_name (str)**

**Returns:** type[nodetool.workflows.base_node.BaseNode] | None

### get_comfy_class_by_name

Retrieve node classes based on their class name.


**Args:**

- **class_name (str)**: The name of the node class to retrieve.


**Returns:**

- **list[type[BaseNode]]**: A list of node classes matching the given name.


**Note:**

If no exact match is found, it attempts to find a match by removing hyphens from the class name.
**Args:**
- **class_name (str)**

**Returns:** type

### get_node_class

Retrieve a node class based on its unique node type identifier.


**Args:**

- **node_type (str)**: The node type identifier.


**Returns:**

- **type[BaseNode] | None**: The node class if found, None otherwise.
**Args:**
- **node_type (str)**

**Returns:** type[nodetool.workflows.base_node.BaseNode] | None

### get_registered_node_classes

Retrieve all registered and visible node classes.


**Returns:**

- **list[type[BaseNode]]**: A list of all registered node classes that are marked as visible.
### memoized_class_method

A decorator that implements memoization for class methods using a functional approach.
**Args:**
- **func (typing.Callable[..., ~T])**

### type_metadata

Generate TypeMetadata for a given Python type.


**Args:**

- **python_type (Type | UnionType)**: The Python type to generate metadata for.


**Returns:**

- **TypeMetadata**: Metadata describing the structure and properties of the input type.


**Raises:**

- **ValueError**: If the input type is unknown or unsupported.


**Note:**

Supports basic types, lists, dicts, optional types, unions, and enums.
**Args:**
- **python_type (typing.Union[typing.Type, types.UnionType])**

**Returns:** TypeMetadata

