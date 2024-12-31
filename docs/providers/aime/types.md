# nodetool.providers.aime.types

## JobEvent

**Fields:**
- **success** (bool)
- **job_id** (str)
- **ep_version** (int)
- **job_state** (str)
- **progress** (nodetool.providers.aime.types.Progress | None)
- **job_result** (nodetool.providers.aime.types.JobResult | None)


## JobResult

**Fields:**
- **success** (bool)
- **job_id** (str | None)
- **ep_version** (int | None)
- **job_state** (str | None)
- **job_result** (dict | None)
- **images** (typing.Optional[typing.List[str]])
- **text** (str | None)
- **prompt** (str | None)
- **text_output** (str | None)
- **audio_output** (str | None)
- **seed** (int | None)
- **model_name** (str | None)
- **compute_duration** (float | None)
- **total_duration** (float)
- **auth** (str | None)
- **worker_interface_version** (str | None)


## JobStatus

**Fields:**
- **success** (bool)
- **job_id** (str)
- **ep_version** (int)


## Progress

**Fields:**
- **start_time** (float | None)
- **start_time_compute** (float | None)
- **job_type** (str | None)
- **auth_key** (str | None)
- **progress** (int)
- **progress_data** (nodetool.providers.aime.types.ProgressData | None)
- **estimate** (decimal.Decimal | None)
- **queue_position** (int | None)
- **num_workers_online** (int | None)


## ProgressData

**Fields:**
- **progress_images** (typing.Optional[typing.List[str]])
- **progress_message** (typing.Optional[str])


