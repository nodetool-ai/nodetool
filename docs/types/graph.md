# nodetool.types.graph

## Edge

**Inherits from:** BaseModel

- **id** (`str | None`)
- **source** (`str`)
- **sourceHandle** (`str`)
- **target** (`str`)
- **targetHandle** (`str`)
- **ui_properties** (`dict[str, str] | None`)

## Graph

**Inherits from:** BaseModel

- **nodes** (`typing.List[nodetool.types.graph.Node]`)
- **edges** (`typing.List[nodetool.types.graph.Edge]`)

## Node

**Inherits from:** BaseModel

- **id** (`str`)
- **parent_id** (`str | None`)
- **type** (`str`)
- **data** (`Any`)
- **ui_properties** (`Any`)

