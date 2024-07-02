# nodetool.api.types.workflow

## Workflow

**Inherits from:** BaseModel

- **id** (`str`)
- **access** (`str`)
- **created_at** (`str`)
- **updated_at** (`str`)
- **name** (`str`)
- **description** (`str`)
- **thumbnail** (`str | None`)
- **thumbnail_url** (`str | None`)
- **graph** (`Graph`)
- **input_schema** (`dict[str, typing.Any] | None`)
- **output_schema** (`dict[str, typing.Any] | None`)

## WorkflowList

**Inherits from:** BaseModel

- **next** (`str | None`)
- **workflows** (`typing.List[nodetool.api.types.workflow.Workflow]`)

## WorkflowRequest

**Inherits from:** BaseModel

- **name** (`str`)
- **description** (`str`)
- **thumbnail** (`str | None`)
- **access** (`str`)
- **graph** (`nodetool.api.types.graph.Graph | None`)
- **comfy_workflow** (`dict[str, typing.Any] | None`)

