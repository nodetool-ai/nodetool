# nodetool.models.database_adapter

## DatabaseAdapter

### create_table

**Args:**

**Returns:** None

### delete

**Args:**
- **primary_key (Any)**

**Returns:** None

### drop_table

**Args:**

**Returns:** None

### get

**Args:**
- **key (Any)**

**Returns:** typing.Optional[typing.Dict[str, typing.Any]]

### get_primary_key

**Args:**

**Returns:** str

### query

**Args:**
- **condition (str)**
- **values (typing.Dict[str, typing.Any])**
- **limit (int) (default: 100)**
- **reverse (bool) (default: False)**
- **start_key (str | None) (default: None)**
- **index (str | None) (default: None)**

**Returns:** tuple[list[dict[str, typing.Any]], str]

### save

**Args:**
- **item (typing.Dict[str, typing.Any])**

**Returns:** None

