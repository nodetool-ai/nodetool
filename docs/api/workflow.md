# nodetool.api.workflow

#### `create`

**Parameters:**

- `workflow_request` (WorkflowRequest)
- `user` (User) (default: `Depends(current_user)`)

**Returns:** `Workflow`

#### `delete_workflow`

**Parameters:**

- `id` (str)
- `user` (User) (default: `Depends(current_user)`)

**Returns:** `None`

#### `examples`

**Returns:** `WorkflowList`

#### `get_public_workflow`

**Parameters:**

- `id` (str)

**Returns:** `Workflow`

#### `get_workflow`

**Parameters:**

- `id` (str)
- `user` (User) (default: `Depends(current_user)`)

**Returns:** `Workflow`

#### `index`

**Parameters:**

- `user` (User) (default: `Depends(current_user)`)
- `cursor` (typing.Optional[str]) (default: `None`)
- `limit` (int) (default: `100`)

**Returns:** `WorkflowList`

#### `load_workflows_ignoring_exceptions`

Load workflows ignoring exceptions from missing nodes or old versions.

**Parameters:**

- `workflows` (list[nodetool.models.workflow.Workflow])

#### `public`

**Parameters:**

- `limit` (int) (default: `100`)
- `cursor` (typing.Optional[str]) (default: `None`)

**Returns:** `WorkflowList`

#### `update_workflow`

**Parameters:**

- `id` (str)
- `workflow_request` (WorkflowRequest)
- `user` (User) (default: `Depends(current_user)`)

**Returns:** `Workflow`

#### `user_workflows`

**Parameters:**

- `user_id` (str)
- `limit` (int) (default: `100`)
- `cursor` (typing.Optional[str]) (default: `None`)

**Returns:** `WorkflowList`

