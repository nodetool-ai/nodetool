# nodetool.api.message

#### `create`

**Parameters:**

- `req` (MessageCreateRequest)
- `user` (User) (default: `Depends(current_user)`)

**Returns:** `Message`

#### `get`

**Parameters:**

- `message_id` (str)
- `user` (User) (default: `Depends(current_user)`)

**Returns:** `Message`

#### `index`

**Parameters:**

- `thread_id` (str)
- `reverse` (bool) (default: `False`)
- `user` (User) (default: `Depends(current_user)`)
- `cursor` (typing.Optional[str]) (default: `None`)
- `limit` (int) (default: `100`)

**Returns:** `MessageList`

