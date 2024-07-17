# nodetool.metadata.type_metadata

## TypeMetadata

Metadata for a type.

- **type** (str)
- **optional** (bool)
- **values** (typing.Optional[list[str | int]])
- **type_args** (list[nodetool.metadata.type_metadata.TypeMetadata])
- **type_name** (typing.Optional[str])

### get_json_schema

Returns a JSON schema for the type.
**Args:**

**Returns:** dict[str, typing.Any]

### get_python_type

**Args:**

### is_asset_type

**Args:**

### is_comfy_type

**Args:**

### is_enum_type

**Args:**

### is_list_type

**Args:**

### is_model_file_type

**Args:**

### is_union_type

**Args:**

