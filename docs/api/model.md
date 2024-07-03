# nodetool.api.model

#### `function_model`

**Parameters:**

- `user` (User) (default: `Depends(current_user)`)

**Returns:** `list[nodetool.metadata.types.FunctionModel]`

#### `index`

**Parameters:**

- `folder` (str)
- `user` (User) (default: `Depends(current_user)`)

**Returns:** `list[str]`

#### `llama_model`

**Parameters:**

- `user` (User) (default: `Depends(current_user)`)

**Returns:** `list[nodetool.metadata.types.LlamaModel]`

