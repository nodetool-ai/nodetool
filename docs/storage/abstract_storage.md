# nodetool.storage.abstract_storage

## AbstractStorage

**Inherits from:** ABC

#### `delete`

**Parameters:**

- `file_name` (str)

#### `download`

**Parameters:**

- `key` (str)
- `stream` (IO)

#### `download_stream`

**Parameters:**

- `key` (str)

**Returns:** `typing.AsyncIterator[bytes]`

#### `file_exists`

**Parameters:**

- `key` (str)

**Returns:** `bool`

#### `generate_presigned_url`

**Parameters:**

- `client_method` (str)
- `object_name` (str)
- `expiration` (default: `604800`)

**Returns:** `str`

#### `get_base_url`

**Parameters:**


**Returns:** `str`

#### `get_mtime`

**Parameters:**

- `key` (str)

**Returns:** `datetime`

#### `get_url`

**Parameters:**

- `key` (str)

**Returns:** `str`

#### `upload`

**Parameters:**

- `key` (str)
- `content` (IO)

**Returns:** `str`

