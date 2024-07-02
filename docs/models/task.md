# nodetool.models.task

## Task

**Inherits from:** DBModel

- **id** (`str`)
- **task_type** (`str`)
- **user_id** (`str`)
- **thread_id** (`str`)
- **status** (`str`)
- **name** (`str`)
- **instructions** (`str`)
- **dependencies** (`list[str]`)
- **required_capabilities** (`list[str]`)
- **started_at** (`datetime`)
- **finished_at** (`datetime.datetime | None`)
- **error** (`str | None`)
- **result** (`str | None`)
- **cost** (`float | None`)

