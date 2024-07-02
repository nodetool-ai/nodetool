# nodetool.metadata.type_metadata

## TypeMetadata

Metadata for a type.

**Inherits from:** BaseModel

- **type** (`str`)
- **optional** (`bool`)
- **values** (`typing.Optional[list[str | int]]`)
- **type_args** (`list[nodetool.metadata.type_metadata.TypeMetadata]`)
- **type_name** (`typing.Optional[str]`)

#### `get_json_schema(self) -> dict[str, typing.Any]`

Returns a JSON schema for the type.

**Parameters:**


**Returns:** `dict[str, typing.Any]`

#### `get_python_type(self)`

**Parameters:**


#### `is_asset_type(self)`

**Parameters:**


#### `is_comfy_type(self)`

**Parameters:**


#### `is_enum_type(self)`

**Parameters:**


#### `is_list_type(self)`

**Parameters:**


#### `is_union_type(self)`

**Parameters:**


