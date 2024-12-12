# nodetool.types.job

## Job

**Fields:**
- **id** (str)
- **job_type** (str)
- **status** (str)
- **workflow_id** (str)
- **started_at** (str)
- **finished_at** (str | None)
- **error** (str | None)
- **cost** (float | None)


## JobCancelledException

## JobList

**Fields:**
- **next** (typing.Optional[str])
- **jobs** (typing.List[nodetool.types.job.Job])


## JobRequest

**Fields:**
- **workflow_id** (str)
- **params** (dict)


## JobUpdate

**Fields:**
- **type** (typing.Literal['job_update'])
- **status** (str)
- **job_id** (str | None)
- **message** (str | None)
- **result** (dict | None)
- **error** (str | None)


