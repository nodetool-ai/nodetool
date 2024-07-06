# nodetool.models.database_adapter

## DatabaseAdapter

#### `create_table`

**Parameters:**

- `table_name` (str)
- `key_schema` (typing.Dict[str, str])
- `attribute_definitions` (typing.Dict[str, str])
- `global_secondary_indexes` (typing.Optional[typing.Dict[str, typing.Dict[str, str]]]) (default: `None`)
- `read_capacity_units` (int) (default: `1`)
- `write_capacity_units` (int) (default: `1`)

**Returns:** `None`

#### `delete`

**Parameters:**

- `primary_key` (Any)

**Returns:** `None`

#### `drop_table`

**Parameters:**

- `table_name` (str)

**Returns:** `None`

#### `get`

**Parameters:**

- `key` (Any)

**Returns:** `typing.Optional[typing.Dict[str, typing.Any]]`

#### `get_primary_key`

**Parameters:**


**Returns:** `str`

#### `query`

**Parameters:**

- `condition` (str)
- `values` (typing.Dict[str, typing.Any])
- `limit` (int) (default: `100`)
- `reverse` (bool) (default: `False`)
- `start_key` (str | None) (default: `None`)
- `index` (str | None) (default: `None`)

**Returns:** `tuple[list[dict[str, typing.Any]], str]`

#### `save`

**Parameters:**

- `item` (typing.Dict[str, typing.Any])

**Returns:** `None`

