# nodetool.models.workflow

## Workflow

**Fields:**
- **id** (str)
- **user_id** (str)
- **access** (str)
- **created_at** (datetime)
- **updated_at** (datetime)
- **name** (str)
- **tags** (list[str] | None)
- **description** (str | None)
- **thumbnail** (str | None)
- **graph** (dict)

### before_save

**Args:**

### get_api_graph

Returns the graph object for the workflow.
**Args:**

**Returns:** Graph

### get_graph

Returns the graph object for the workflow.
**Args:**

**Returns:** Graph


