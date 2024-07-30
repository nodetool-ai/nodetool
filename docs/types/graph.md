# nodetool.types.graph

## Edge

- **id** (str | None)
- **source** (str)
- **sourceHandle** (str)
- **target** (str)
- **targetHandle** (str)
- **ui_properties** (dict[str, str] | None)

## Graph

- **nodes** (typing.List[nodetool.types.graph.Node])
- **edges** (typing.List[nodetool.types.graph.Edge])

## Node

- **id** (str)
- **parent_id** (str | None)
- **type** (str)
- **data** (typing.Any)
- **ui_properties** (typing.Any)

### remove_connected_slots

Clears specific slots in the data field of nodes based on connected target handles.


**Args:**

- **graph (Graph)**: The graph object containing nodes and edges.


**Returns:**

- **Graph**: The updated graph object with cleared slots.
