# nodetool.api.storage

#### `delete`

Deletes the asset for the given key.

**Parameters:**

- `bucket` (str)
- `key` (str)
- `user` (User) (default: `Depends(current_user)`)

#### `get`

Returns the file as a stream for the given key.

**Parameters:**

- `bucket` (str)
- `key` (str)
- `request` (Request)

#### `head`

Returns the metadata for the file with the given key.

**Parameters:**

- `bucket` (str)
- `key` (str)

#### `storage_for_bucket`

**Parameters:**

- `bucket` (str)

**Returns:** `AbstractStorage`

#### `update`

Updates or creates the file for the given key.

**Parameters:**

- `bucket` (str)
- `key` (str)
- `request` (Request)
- `user` (User) (default: `Depends(current_user)`)

