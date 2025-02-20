import asyncio
from asyncio.queues import Queue as AsyncQueue
from queue import Queue
from typing import AsyncGenerator, Any
from uuid import uuid4
from nodetool.common.environment import Environment
from nodetool.types.job import JobUpdate, Job
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.workflow_runner import WorkflowRunner
from nodetool.workflows.types import Error
from nodetool.workflows.threaded_event_loop import ThreadedEventLoop
from nodetool.common.websocket_runner import process_workflow_messages

log = Environment.get_logger()


async def run_workflow(
    req: RunJobRequest,
    runner: WorkflowRunner | None = None,
    context: ProcessingContext | None = None,
    use_thread: bool = False,
) -> AsyncGenerator[Any, None]:
    """
    Runs a workflow asynchronously, with the option to run in a separate thread.

    Args:
        req (RunJobRequest): The request object containing the necessary information for running the workflow.
        runner (WorkflowRunner | None): The workflow runner object. If not provided, a new instance will be created.
        context (ProcessingContext | None): The processing context object. If not provided, a new instance will be created.
        use_thread (bool): Whether to run the workflow in a separate thread. Defaults to False.

    Yields:
        Any: A generator that yields job updates and messages from the workflow.

    Raises:
        Exception: If an error occurs during the execution of the workflow.

    Returns:
        AsyncGenerator[Any, None]: An asynchronous generator that yields job updates and messages from the workflow.
    """
    if context is None:
        context = ProcessingContext(
            user_id=req.user_id,
            auth_token=req.auth_token,
            workflow_id=req.workflow_id,
        )

    if runner is None:
        runner = WorkflowRunner(job_id=uuid4().hex)

    async def run():
        try:
            if req.graph is None:
                log.info(f"Loading workflow graph for {req.workflow_id}")
                workflow = await context.get_workflow(req.workflow_id)
                req.graph = workflow.graph
            await runner.run(req, context)
        except Exception as e:
            log.exception(e)
            context.post_message(
                JobUpdate(job_id=runner.job_id, status="failed", error=str(e))
            )

    if use_thread:
        log.info(f"Running workflow in thread for {req.workflow_id}")
        with ThreadedEventLoop() as tel:
            run_future = tel.run_coroutine(run())

            try:
                async for msg in process_workflow_messages(context, runner):
                    yield msg
            except Exception as e:
                log.exception(e)
                run_future.cancel()
                yield JobUpdate(job_id=runner.job_id, status="failed", error=str(e))
            try:
                run_future.result()
            except Exception as e:
                print(f"An error occurred during workflow execution: {e}")

    else:
        run_task = asyncio.create_task(run())

        try:
            async for msg in process_workflow_messages(context, runner):
                yield msg
        except Exception as e:
            log.exception(e)
            run_task.cancel()
            yield JobUpdate(job_id=runner.job_id, status="failed", error=str(e))

        exception = run_task.exception()
        if exception:
            log.exception(exception)
            yield JobUpdate(job_id=runner.job_id, status="failed", error=str(exception))
