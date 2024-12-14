# nodetool.api.job

### create

**Args:**
- **job_request (RunJobRequest)**
- **user (User) (default: Depends(current_user))**

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
- **job_request (RunJobRequest)**
- **request (Request)**
- **stream (bool) (default: False)**
- **user (User) (default: Depends(current_user))**

### update

Update a job.
**Args:**
- **id (str)**
- **req (JobUpdate)**
- **user (User) (default: Depends(current_user))**

**Returns:** Job

