# nodetool.types.job

## Job

- **id** (`str`)
- **job_type** (`str`)
- **status** (`str`)
- **workflow_id** (`str`)
- **started_at** (`str`)
- **finished_at** (`str | None`)
- **error** (`str | None`)
- **cost** (`float | None`)

## JobCancelledException

## JobList

- **next** (`typing.Optional[str]`)
- **jobs** (`typing.List[nodetool.types.job.Job]`)

## JobRequest

- **workflow_id** (`str`)
- **params** (`dict`)

## JobUpdate

- **type** (`typing.Literal['job_update']`)
- **status** (`str`)
- **job_id** (`str | None`)
- **result** (`dict | None`)
- **error** (`str | None`)

