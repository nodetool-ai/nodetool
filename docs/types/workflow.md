# nodetool.types.workflow

## Workflow

**Fields:**
- **id** (str)
- **access** (str)
- **created_at** (str)
- **updated_at** (str)
- **name** (str)
- **description** (str)
- **thumbnail** (str | None)
- **thumbnail_url** (str | None)
- **graph** (Graph)
- **input_schema** (dict[str, typing.Any] | None)
- **output_schema** (dict[str, typing.Any] | None)


## WorkflowList

**Fields:**
- **next** (str | None)
- **workflows** (typing.List[nodetool.types.workflow.Workflow])


## WorkflowRequest

**Fields:**
- **name** (str)
- **description** (str)
- **thumbnail** (str | None)
- **access** (str)
- **graph** (nodetool.types.graph.Graph | None)
- **comfy_workflow** (dict[str, typing.Any] | None)


### find_thumbnail

**Args:**
- **workflow (Workflow)**

**Returns:** str | None

