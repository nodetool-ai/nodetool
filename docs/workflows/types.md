# nodetool.workflows.types

## BinaryUpdate

- **type** (typing.Literal['binary_update'])
- **node_id** (str)
- **output_name** (str)
- **binary** (bytes)

### encode

Create an encoded message containing two null-terminated strings and PNG data.
**Args:**

**Returns:** bytes

## Error

- **type** (typing.Literal['error'])
- **error** (str)

## NodeProgress

- **type** (typing.Literal['node_progress'])
- **node_id** (str)
- **progress** (int)
- **total** (int)

## NodeUpdate

- **type** (typing.Literal['node_update'])
- **node_id** (str)
- **node_name** (str)
- **status** (str)
- **error** (str | None)
- **logs** (str | None)
- **result** (dict[str, typing.Any] | None)
- **properties** (dict[str, typing.Any] | None)

