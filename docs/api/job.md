# nodetool.api.job

### get

Returns the status of a job.
**Args:**
- **id (str)**
- **user (User) (default: Depends(current_user))**

**Returns:** Job

### index

Returns all assets for a given user or workflow.
**Args:**
- **workflow_id (str | None) (default: None)**
- **cursor (str | None) (default: None)**
- **page_size (int | None) (default: None)**
- **user (User) (default: Depends(current_user))**

**Returns:** JobList

### run

**Args:**
- **request (Request)**
- **job_request (RunJobRequest)**
- **execute (bool) (default: True)**
- **user (User) (default: Depends(current_user))**

### update

Update a job.
**Args:**
- **id (str)**
- **req (JobUpdate)**
- **user (User) (default: Depends(current_user))**

**Returns:** Job

