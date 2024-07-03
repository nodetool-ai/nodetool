# nodetool.metadata.type_metadata

## TypeMetadata

Metadata for a type.

**Inherits from:** BaseModel

- **type** (`str`)
- **optional** (`bool`)
- **values** (`typing.Optional[list[str | int]]`)
- **type_args** (`list[nodetool.metadata.type_metadata.TypeMetadata]`)
- **type_name** (`typing.Optional[str]`)

#### `get_json_schema`

Returns a JSON schema for the type.

**Parameters:**


**Returns:** `dict[str, typing.Any]`

#### `get_python_type`

**Parameters:**


#### `is_asset_type`

**Parameters:**


#### `is_comfy_type`

**Parameters:**


#### `is_enum_type`

**Parameters:**


#### `is_list_type`

**Parameters:**


#### `is_union_type`

**Parameters:**


