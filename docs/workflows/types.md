# nodetool.workflows.types

## BinaryUpdate

**Fields:**
- **type** (typing.Literal['binary_update'])
- **node_id** (str)
- **output_name** (str)
- **binary** (bytes)

### encode

Create an encoded message containing two null-terminated strings and PNG data.
**Args:**

**Returns:** bytes


## Error

**Fields:**
- **type** (typing.Literal['error'])
- **error** (str)


## NodeProgress

**Fields:**
- **type** (typing.Literal['node_progress'])
- **node_id** (str)
- **progress** (int)
- **total** (int)
- **chunk** (str)


## NodeUpdate

**Fields:**
- **type** (typing.Literal['node_update'])
- **node_id** (str)
- **node_name** (str)
- **status** (str)
- **error** (str | None)
- **logs** (str | None)
- **result** (dict[str, typing.Any] | None)
- **properties** (dict[str, typing.Any] | None)


## RunFunction

A message to run a function in the main thread.

**Fields:**
- **type** (typing.Literal['run_function'])
- **function** (typing.Callable)
- **args** (list)
- **kwargs** (dict)


