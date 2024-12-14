# nodetool.api.workflow

### create

**Args:**
- **workflow_request (WorkflowRequest)**
- **user (User) (default: Depends(current_user))**

**Returns:** Workflow

### delete_workflow

**Args:**
- **id (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** None

### examples

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

**Returns:** WorkflowList

### public

**Args:**
- **limit (int) (default: 100)**
- **cursor (typing.Optional[str]) (default: None)**

**Returns:** WorkflowList

### save_example_workflow

**Args:**
- **id (str)**
- **workflow_request (WorkflowRequest)**
- **user (User) (default: Depends(current_user))**

**Returns:** Workflow

### update_workflow

**Args:**
- **id (str)**
- **workflow_request (WorkflowRequest)**
- **user (User) (default: Depends(current_user))**

**Returns:** Workflow

### user_workflows

**Args:**
- **user_id (str)**
- **limit (int) (default: 100)**
- **cursor (typing.Optional[str]) (default: None)**

**Returns:** WorkflowList

