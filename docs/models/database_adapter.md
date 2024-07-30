# nodetool.models.database_adapter

## DatabaseAdapter

### create_table

**Args:**

**Returns:** None

### delete

**Args:**
- **primary_key (typing.Any)**

**Returns:** None

### drop_table

**Args:**

**Returns:** None

### get

**Args:**
- **key (typing.Any)**

**Returns:** typing.Optional[typing.Dict[str, typing.Any]]

### get_primary_key

Get the name of the primary key.
**Args:**

**Returns:** str

### query

**Args:**
- **condition (ConditionBuilder)**
- **limit (int) (default: 100)**
- **reverse (bool) (default: False)**

**Returns:** tuple

### save

**Args:**
- **item (typing.Dict[str, typing.Any])**

**Returns:** None

