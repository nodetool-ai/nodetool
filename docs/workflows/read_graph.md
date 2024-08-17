# nodetool.workflows.read_graph

## GraphParsingError

Custom exception for graph parsing errors.

### convert_graph

Convert a graph from the ComfyUI format to the ComfyUI API format.


**Args:**

- **input_graph (dict[str, Any])**: The graph in ComfyUI format.


**Returns:**

- **dict[str, Any]**: The graph in ComfyUI API format.
**Args:**
- **input_graph (dict)**

**Returns:** dict

### create_edges

Create Edge objects for a node's inputs.


**Args:**

- **edges (List[Edge])**: The list of existing edges.
- **node_id (str)**: The ID of the target node.
- **node_data (Dict[str, Any])**: The data for the node.
- **node_by_id (Dict[str, Node])**: A dictionary mapping node IDs to Node objects.


**Raises:**

- **GraphParsingError**: If a referenced source node cannot be found.
**Args:**
- **edges (typing.List[nodetool.types.graph.Edge])**
- **node_id (str)**
- **node_data (typing.Dict[str, typing.Any])**
- **node_by_id (typing.Dict[str, nodetool.types.graph.Node])**

### create_node

Create a Node object from node data.


**Args:**

- **node_id (str)**: The ID of the node.
- **node_data (Dict[str, Any])**: The data for the node.


**Returns:**

- **Node**: A new Node object.


**Raises:**

- **GraphParsingError**: If the node type cannot be determined or found.
**Args:**
- **node_id (str)**
- **node_data (typing.Dict[str, typing.Any])**

**Returns:** Node

### generate_edge_id

Finds the highest ID in the list of edges and returns a new ID that is one higher.
**Args:**
- **edges (typing.List[nodetool.types.graph.Edge])**

**Returns:** str

### get_edge_names

Get the names of the input edgeds for a given node class.


**Args:**

- **class_name (str)**: The name of the node class.


**Returns:**

- **List[str]**: A list of input names for the node class.
**Args:**
- **class_name (str)**

**Returns:** typing.List[str]

### get_widget_names

Get the names of the widgets for a given node class.


**Args:**

- **class_name (str)**: The name of the node class.


**Returns:**

- **List[str]**: A list of widget names for the node class.
**Args:**
- **class_name (str)**

**Returns:** typing.List[str]

### is_comfy_widget

Check if the widget type is a Comfy widget.


**Args:**

- **type (str)**: The type of the widget.


**Returns:**

- **bool**: True if the widget is a Comfy widget, False otherwise.
**Args:**
- **type (str | list)**

**Returns:** bool

### read_graph

This function reads a graph from a dictionary representation.


**The format of the dictionary representation has the following structure:**

{
- **"source_node_id"**: {
- **"type"**: "node_type",
},
- **"node_id"**: {
- **"type"**: "node_type",
- **"data"**: {
- **"property_name"**: "property_value",
- **"property_name"**: ["source_node_id", "source_node_output_handle"]
}
}
}

It also supports the comfy workflow format.
In this case, we only search the comfy namespace for node classes
to avoid conflicts with other node classes.


**The format of the ComfyUI representation has the following structure:**

{
- **"source_node_id"**: {
- **"class_type"**: "node_type",
},
- **"node_id"**: {
- **"class_type"**: "node_type",
- **"inputs"**: {
- **"property_name"**: "property_value",
- **"property_name"**: ["source_node_id", 0]
}
}
}


**Parameters:**


- json (dict): The dictionary representation of the graph.


**Returns:**


- A tuple containing two lists: a list of edges and a list of nodes.


**Raises:**


- GraphParsingError: If there's an error in parsing the graph structure.


**Example usage:**

```
graph_json = {
- **"source_node_id"**: {
- **"type"**: "node_type",
},
- **"node_id"**: {
- **"type"**: "node_type",
- **"data"**: {
- **"property_name"**: "property_value",
- **"property_name"**: ["source_node_id", "source_node_output_handle"]
}
}
}
edges, nodes = read_graph(graph_json)
```
**Args:**
- **json (typing.Dict[str, typing.Any])**

**Returns:** typing.Tuple[typing.List[nodetool.types.graph.Edge], typing.List[nodetool.types.graph.Node]]

