# nodetool.workflows.property

## Property

Property of a node.

**Inherits from:** BaseModel

- **name** (`str`)
- **type** (`TypeMetadata`)
- **default** (`typing.Optional[typing.Any]`)
- **title** (`typing.Optional[str]`)
- **description** (`typing.Optional[str]`)
- **min** (`typing.Optional[float]`)
- **max** (`typing.Optional[float]`)

#### `from_field(name: str, type_: nodetool.metadata.type_metadata.TypeMetadata, field: pydantic.fields.FieldInfo)`

**Parameters:**

- `name` (str)
- `type_` (TypeMetadata)
- `field` (FieldInfo)

#### `get_json_schema(self)`

Returns a JSON schema for the self.

**Parameters:**


