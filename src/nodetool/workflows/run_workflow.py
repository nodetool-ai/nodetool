import asyncio
from asyncio.queues import Queue
from typing import AsyncGenerator, Any
from uuid import uuid4
from nodetool.common.environment import Environment
from nodetool.types.job import JobUpdate, Job
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.workflow_runner import WorkflowRunner
from nodetool.workflows.types import Error
from nodetool.workflows.threaded_event_loop import ThreadedEventLoop

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
    api_client = Environment.get_nodetool_api_client(
        user_id=req.user_id, auth_token=req.auth_token, api_url=req.api_url
    )

    if context is None:
        context = ProcessingContext(
            user_id=req.user_id,
            auth_token=req.auth_token,
            workflow_id=req.workflow_id,
            api_client=api_client,
            queue=Queue(),
        )

    if runner is None:
        runner = WorkflowRunner(job_id=uuid4().hex)

    yield JobUpdate(job_id=runner.job_id, status="running")

    async def run():
        try:
            await runner.run(req, context)
        except Exception as e:
            log.exception(e)
            context.post_message(Error(error=str(e)))

    if use_thread:
        with ThreadedEventLoop() as tel:
            run_future = tel.run_coroutine(run())

            try:
                while runner.is_running():
                    if context.has_messages():
                        msg = await context.pop_message_async()
                        if isinstance(msg, Error):
                            raise Exception(msg.error)
                        yield msg
                    else:
                        await asyncio.sleep(0.1)

                # Process remaining messages
                while context.has_messages():
                    msg = await context.pop_message_async()
                    yield msg

            except Exception as e:
                log.exception(e)
                run_future.cancel()
                yield Error(error=str(e))

            try:
                await run_future
            except asyncio.CancelledError:
                pass

    else:
        run_task = asyncio.create_task(run())

        try:
            while not run_task.done():
                if context.has_messages():
                    msg = await context.pop_message_async()
                    if isinstance(msg, Error):
                        raise Exception(msg.error)
                    yield msg
                else:
                    await asyncio.sleep(0.01)

            # Process remaining messages
            while context.has_messages():
                msg = await context.pop_message_async()
                yield msg

        except Exception as e:
            log.exception(e)
            run_task.cancel()
            yield Error(error=str(e))

        exception = run_task.exception()
        if exception:
            log.exception(exception)
            yield Error(error=str(exception))
