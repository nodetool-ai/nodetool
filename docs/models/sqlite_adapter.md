# nodetool.models.sqlite_adapter

## SQLiteAdapter

### create_table

**Args:**
- **suffix (default: )**

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

### get_current_schema

Retrieves the current schema of the table from the database.
**Args:**

**Returns:** set

### get_desired_schema

Retrieves the desired schema based on the defined fields.
**Args:**

**Returns:** set

### migrate_table

Inspects the current schema of the database and migrates the table to the desired schema.
**Args:**

**Returns:** None

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

### table_exists

**Args:**

**Returns:** bool

### convert_from_sqlite_attributes

Convert a dictionary of attributes from SQLite to a dictionary of Python types based on the provided fields.
**Args:**
- **attributes (typing.Dict[str, typing.Any])**
- **fields (typing.Dict[str, pydantic.fields.FieldInfo])**

**Returns:** typing.Dict[str, typing.Any]

### convert_from_sqlite_format

Convert a value from SQLite to a Python type based on the provided Python type.
Deserialize JSON strings to lists and dicts.

- ****: param value: The value to convert, or None.
- ****: param py_type: The Python type of the value.
- ****: return: The value converted to a Python type.
**Args:**
- **value (typing.Any)**
- **py_type (typing.Type)**

**Returns:** typing.Any

### convert_to_sqlite_attributes

Convert a dictionary of attributes from SQLite to a dictionary of Python types based on the provided fields.
**Args:**
- **attributes (typing.Dict[str, typing.Any])**
- **fields (typing.Dict[str, pydantic.fields.FieldInfo])**

**Returns:** typing.Dict[str, typing.Any]

### convert_to_sqlite_format

Convert a Python value to a format suitable for SQLite based on the provided Python type.
Serialize lists and dicts to JSON strings. Encode bytes using base64.

- ****: param value: The value to convert, or None.
- ****: param py_type: The Python type of the value.
- ****: return: The value converted to a SQLite-compatible format.
**Args:**
- **value (typing.Any)**
- **py_type (typing.Type)**

**Returns:** typing.Union[int, float, str, bytes, NoneType]

### get_sqlite_type

**Args:**
- **field_type (typing.Any)**

**Returns:** str

### translate_condition_to_sql

Translates a condition string with custom syntax into an SQLite-compatible SQL condition string using regex.


**Args:**


- condition (str): The condition string to translate, e.g.,
- **"user_id =**: user_id AND begins_with(content_type, :content_type)".


**Returns:**


- str: The translated SQL condition string compatible with SQLite.
