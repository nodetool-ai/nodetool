# nodetool.types.job

## Job

**Inherits from:** BaseModel

- **id** (`str`)
- **job_type** (`str`)
- **status** (`str`)
- **workflow_id** (`str`)
- **started_at** (`str`)
- **finished_at** (`str | None`)
- **error** (`str | None`)
- **cost** (`float | None`)

## JobCancelledException

**Inherits from:** Exception

## JobList

**Inherits from:** BaseModel

- **next** (`typing.Optional[str]`)
- **jobs** (`typing.List[nodetool.types.job.Job]`)

## JobRequest

**Inherits from:** BaseModel

- **workflow_id** (`str`)
- **params** (`dict`)

## JobUpdate

**Inherits from:** BaseModel

- **type** (`typing.Literal['job_update']`)
- **status** (`str`)
- **job_id** (`str | None`)
- **result** (`dict | None`)
- **error** (`str | None`)

