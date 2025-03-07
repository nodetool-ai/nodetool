# nodetool.api.workflow

## RunWorkflowRequest

**Fields:**
- **params** (dict[str, typing.Any])


### create

**Args:**
- **workflow_request (WorkflowRequest)**
- **background_tasks (BackgroundTasks)**
- **user (User) (default: Depends(current_user))**

**Returns:** Workflow

### delete_workflow

**Args:**
- **id (str)**
- **background_tasks (BackgroundTasks)**
- **user (User) (default: Depends(current_user))**

**Returns:** None

### examples

### find_thumbnail

**Args:**
- **workflow (Workflow)**

**Returns:** str | None

### from_model

**Args:**
- **workflow (Workflow)**

### get_public_workflow

**Args:**
- **id (str)**

**Returns:** Workflow

### get_workflow

**Args:**
- **id (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** Workflow

### index

**Args:**
- **user (User) (default: Depends(current_user))**
- **cursor (typing.Optional[str]) (default: None)**
- **limit (int) (default: 100)**
- **columns (typing.Optional[str]) (default: None)**

**Returns:** WorkflowList

### public

**Args:**
- **limit (int) (default: 100)**
- **cursor (typing.Optional[str]) (default: None)**
- **columns (typing.Optional[str]) (default: None)**

**Returns:** WorkflowList

### run_workflow_by_id

Run a specific workflow by ID.
**Args:**
- **id (str)**
- **run_workflow_request (RunWorkflowRequest)**
- **request (Request)**
- **stream (bool) (default: False)**
- **user (User) (default: Depends(current_user))**

### save_example_workflow

**Args:**
- **id (str)**
- **workflow_request (WorkflowRequest)**

**Returns:** Workflow

### update_workflow

**Args:**
- **id (str)**
- **workflow_request (WorkflowRequest)**
- **background_tasks (BackgroundTasks)**
- **user (User) (default: Depends(current_user))**

**Returns:** Workflow

### user_workflows

**Args:**
- **user_id (str)**
- **limit (int) (default: 100)**
- **cursor (typing.Optional[str]) (default: None)**
- **columns (typing.Optional[str]) (default: None)**

**Returns:** WorkflowList

