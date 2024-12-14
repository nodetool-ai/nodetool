# nodetool.workflows.http_stream_runner

## HTTPStreamRunner

Runs a workflow using a FastAPI streaming endpoint.
Attributes:
context (ProcessingContext | None): The processing context for job execution.
job_id (str | None): The ID of the current job.
runner (WorkflowRunner | None): The workflow runner for job execution.
pre_run_hook (Any): A hook function to be executed before running a job.
post_run_hook (Any): A hook function to be executed after running a job.

**Tags:** 

