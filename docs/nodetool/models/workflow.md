# nodetool.models.workflow

## Workflow

**Inherits from:** DBModel

- **id** (`str`)
- **user_id** (`str`)
- **access** (`str`)
- **created_at** (`datetime`)
- **updated_at** (`datetime`)
- **name** (`str`)
- **description** (`str | None`)
- **thumbnail** (`str | None`)
- **graph** (`dict`)

#### `before_save(self)`

**Parameters:**


#### `get_api_graph(self) -> nodetool.api.types.graph.Graph`

Returns the graph object for the workflow.

**Parameters:**


**Returns:** `Graph`

#### `get_graph(self) -> nodetool.workflows.graph.Graph`

Returns the graph object for the workflow.

**Parameters:**


**Returns:** `Graph`

