# nodetool.workflows.property

## Property

Property of a node.

- **name** (`str`)
- **type** (`TypeMetadata`)
- **default** (`typing.Optional[typing.Any]`)
- **title** (`typing.Optional[str]`)
- **description** (`typing.Optional[str]`)
- **min** (`typing.Optional[float]`)
- **max** (`typing.Optional[float]`)

#### `from_field`

**Parameters:**

- `name` (str)
- `type_` (TypeMetadata)
- `field` (FieldInfo)

#### `get_json_schema`

Returns a JSON schema for the self.

**Parameters:**


