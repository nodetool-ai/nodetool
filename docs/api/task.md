# nodetool.api.task

### create

Creates a new task.
**Args:**
- **req (TaskCreateRequest)**
- **user (User) (default: Depends(current_user))**

**Returns:** Task

### delete

Deletes the task with the given id.
**Args:**
- **id (str)**
- **user (User) (default: Depends(current_user))**

### get

Returns the task with the given id.
**Args:**
- **id (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** Task

### index

Returns all tasks for the current user, optionally filtered by status.
**Args:**
- **thread_id (str)**
- **user (User) (default: Depends(current_user))**
- **cursor (typing.Optional[str]) (default: None)**
- **page_size (typing.Optional[int]) (default: None)**

**Returns:** TaskList

### update

Updates the task with the given id.
**Args:**
- **id (str)**
- **req (TaskUpdateRequest)**
- **user (User) (default: Depends(current_user))**

**Returns:** Task

