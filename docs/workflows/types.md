# nodetool.workflows.types

## Error

**Inherits from:** BaseModel

- **type** (`typing.Literal['error']`)
- **error** (`str`)

## NodeProgress

**Inherits from:** BaseModel

- **type** (`typing.Literal['node_progress']`)
- **node_id** (`str`)
- **progress** (`int`)
- **total** (`int`)

## NodeUpdate

**Inherits from:** BaseModel

- **type** (`typing.Literal['node_update']`)
- **node_id** (`str`)
- **node_name** (`str`)
- **status** (`str`)
- **error** (`str | None`)
- **logs** (`str | None`)
- **result** (`dict[str, typing.Any] | None`)
- **properties** (`dict[str, typing.Any] | None`)
- **started_at** (`str | None`)
- **completed_at** (`str | None`)

