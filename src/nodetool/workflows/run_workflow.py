from queue import Queue
from nodetool.api.types.job import JobUpdate
from nodetool.common.environment import Environment
from nodetool.models.job import Job
from nodetool.workflows.run_job_request import RunJobRequest

import asyncio
import threading
import time

"""
This module contains the `run_workflow` function, which is responsible for executing a workflow based on a given RunJobRequest.

The main function, `run_workflow`, performs the following tasks:
1. Creates a ProcessingContext and Job based on the input request.
2. Initializes a WorkflowRunner with the created job ID.
3. Runs the workflow asynchronously in a separate thread.
4. Yields messages from the context queue as JSON strings.
5. Handles errors and exceptions, yielding them as Error messages.

The module uses asyncio for asynchronous execution and threading for parallel processing.
It also utilizes various components from the nodetool package, including types, models, and workflow-related classes.

Note: This module assumes that the necessary components and configurations are properly set up in the nodetool package.
"""

log = Environment.get_logger()


def run_workflow(req: RunJobRequest):
    from nodetool.workflows.types import Error
    from nodetool.workflows.processing_context import (
        ProcessingContext,
    )
    from nodetool.workflows.workflow_runner import WorkflowRunner

    assert req.graph is not None, "Graph is required"

    context = ProcessingContext(
        user_id=req.user_id,
        auth_token=req.auth_token,
        workflow_id=req.workflow_id,
        queue=Queue(),
    )
    job = Job.create(
        job_type=req.job_type,
        workflow_id=req.workflow_id,
        user_id=req.user_id,
        graph=req.graph.model_dump(),
        status="running",
    )
    assert job

    loop = asyncio.get_event_loop()
    loop.set_debug(True)
    runner = WorkflowRunner(job_id=job.id)

    async def run():
        try:
            await runner.run(req, context)
        except Exception as e:
            log.exception(e)
            context.post_message(Error(error=str(e)))

    thread = threading.Thread(target=lambda: asyncio.run(run()))
    thread.start()

    try:
        while runner.is_running():
            if context.has_messages():
                msg = context.pop_message()
                yield msg.model_dump_json() + "\n"
                if isinstance(msg, Error):
                    break
                elif isinstance(msg, JobUpdate):
                    pass
            else:
                time.sleep(0.1)

        while context.has_messages():
            msg = context.pop_message()
            yield msg.model_dump_json() + "\n"

        thread.join()

    except Exception as e:
        log.exception(e)
        yield Error(error=str(e)).model_dump_json() + "\n"
