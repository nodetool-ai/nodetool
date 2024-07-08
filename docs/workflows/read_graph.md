# nodetool.workflows.read_graph

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


**It also supports the comfy workflow format:**

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


- Exception: If the node type or class cannot be found.
- Exception: If a source node referenced by a node cannot be found.


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
- **json (dict)**

