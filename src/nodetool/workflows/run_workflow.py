import sys
from nodetool.common.environment import Environment
from nodetool.types.job import JobUpdate, Job
from nodetool.workflows.examples import load_example
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.run_job_request import RunJobRequest
import asyncio
from typing import Any, TypeVar

from nodetool.workflows.threaded_event_loop import ThreadedEventLoop
from nodetool.workflows.types import Error
from nodetool.workflows.workflow_runner import WorkflowRunner

import asyncio
from asyncio.queues import Queue
from typing import AsyncGenerator, Any


log = Environment.get_logger()


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


async def run_workflow_in_thread(req: RunJobRequest) -> AsyncGenerator[Any, None]:
    import nodetool.nodes.anthropic
    import nodetool.nodes.huggingface
    import nodetool.nodes.nodetool
    import nodetool.nodes.openai
    import nodetool.nodes.replicate

    api_client = Environment.get_nodetool_api_client(req.user_id, req.auth_token)
    res = await api_client.post(
        "api/jobs/", json=req.model_dump(), params={"execute": "false"}
    )
    job = Job(**res.json())

    def job_update(job: Job):
        return JobUpdate(job_id=job.id, status=job.status)

    yield job_update(job)

    async def run(req: RunJobRequest, runner: WorkflowRunner, queue: Queue):
        try:
            context = ProcessingContext(
                user_id=req.user_id,
                auth_token=req.auth_token,
                workflow_id=req.workflow_id,
                queue=queue,
            )

            await runner.run(req, context)
        except Exception as e:
            log.exception(e)
            context.post_message(Error(error=str(e)))

    with ThreadedEventLoop() as tel:
        queue = Queue()
        runner = WorkflowRunner(job_id=job.id)
        # Schedule the run coroutine in the threaded event loop
        run_future = tel.run_coroutine(run(req, runner, queue))

        try:
            while runner.is_running():
                res = await api_client.get(f"api/jobs/{job.id}")
                job = Job(**res.json())
                if job.status == "cancelled":
                    runner.cancel()
                    break

                if queue.qsize() > 0:
                    msg = await queue.get()
                    if isinstance(msg, Error):
                        raise Exception(msg.error)
                    yield msg
                else:
                    await asyncio.sleep(0.1)

            # Ensure all remaining messages are processed
            while queue.qsize() > 0:
                msg = await queue.get()
                yield msg

        except Exception as e:
            log.exception(e)
            # Ensure the run coroutine is cancelled if an exception occurs
            run_future.cancel()

        # Wait for the run coroutine to complete
        try:
            print(run_future.result())
        except asyncio.CancelledError:
            pass


async def run_workflow(req: RunJobRequest) -> AsyncGenerator[Any, None]:
    import nodetool.nodes.anthropic
    import nodetool.nodes.huggingface
    import nodetool.nodes.nodetool
    import nodetool.nodes.openai
    import nodetool.nodes.replicate

    api_client = Environment.get_nodetool_api_client(
        user_id=req.user_id, auth_token=req.auth_token, api_url=req.api_url
    )

    context = ProcessingContext(
        user_id=req.user_id,
        auth_token=req.auth_token,
        workflow_id=req.workflow_id,
        api_client=api_client,
        queue=Queue(),
    )

    try:
        run_task = None
        job = await context.create_job(req)
        runner = WorkflowRunner(job_id=job.id)

        def job_update(job: Job):
            return JobUpdate(job_id=job.id, status=job.status)

        yield job_update(job)

        async def run():
            try:
                await runner.run(req, context)
            except Exception as e:
                log.exception(e)
                context.post_message(Error(error=str(e)))

        # Create a task for running the workflow
        run_task = asyncio.create_task(run())

        while not run_task.done():
            job = await context.get_job(job.id)
            if job.status == "cancelled":
                runner.cancel()
                break

            if context.has_messages():
                msg = await context.pop_message_async()
                if isinstance(msg, Error):
                    raise Exception(msg.error)
                yield msg
            else:
                await asyncio.sleep(0.1)

        # Process any remaining messages
        while context.has_messages():
            msg = await context.pop_message_async()
            yield msg

    except Exception as e:
        log.exception(e)
        if run_task:
            run_task.cancel()
        yield Error(error=str(e))

    if run_task:
        exception = run_task.exception()
        if exception:
            log.exception(exception)
            yield Error(error=str(exception))


if __name__ == "__main__":
    workflow = load_example("Two Stage Stable Diffusion.json")

    req = RunJobRequest(
        user_id="1",
        auth_token="token",
        graph=workflow.graph,
    )

    async def run():
        async for msg in run_workflow(req):
            print(msg)

            # flush stdout to ensure messages are printed immediately
            sys.stdout.flush()
            sys.stderr.flush()

    asyncio.run(run())
