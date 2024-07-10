import json
from queue import Queue
from nodetool.types.graph import Graph
from nodetool.common.environment import Environment
from nodetool.models.job import Job
from nodetool.workflows.examples import load_example
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.read_graph import read_graph
from nodetool.workflows.run_job_request import RunJobRequest
import asyncio
from asyncio import AbstractEventLoop
import threading
from typing import Callable, Coroutine, Any, TypeVar, Optional

from nodetool.workflows.types import Error
from nodetool.workflows.workflow_runner import WorkflowRunner

import asyncio
from typing import AsyncGenerator, Any
from queue import Queue


log = Environment.get_logger()


T = TypeVar("T")

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


class ThreadedEventLoop:
    """
    ## Overview

    The `ThreadedEventLoop` class provides a convenient way to run an asyncio event loop in a separate thread.
    This is particularly useful for integrating asynchronous operations with synchronous code or for isolating certain async operations.

    ## Usage Examples

    ### Basic Usage

    ```python
    tel = ThreadedEventLoop()
    tel.start()

    # Run a coroutine
    async def my_coroutine():
        await asyncio.sleep(1)
        return "Hello, World!"

    future = tel.run_coroutine(my_coroutine())
    result = future.result()  # Blocks until the coroutine completes
    print(result)  # Output: Hello, World!

    tel.stop()
    ```

    ### Using as a Context Manager

    ```python
    async def my_coroutine():
        await asyncio.sleep(1)
        return "Hello, World!"

    with ThreadedEventLoop() as tel:
        future = tel.run_coroutine(my_coroutine())
        result = future.result()
        print(result)  # Output: Hello, World!
    ```

    ### Running a Synchronous Function

    ```python
    import time

    def slow_function(duration):
        time.sleep(duration)
        return f"Slept for {duration} seconds"

    with ThreadedEventLoop() as tel:
        future = tel.run_in_executor(slow_function, 2)
        result = future.result()
        print(result)  # Output: Slept for 2 seconds
    ```

    ## Thread Safety and Best Practices

    1. The `run_coroutine` and `run_in_executor` methods are thread-safe and can be called from any thread.
    2. Avoid directly accessing or modifying the internal event loop (`self._loop`) from outside the class.
    3. Always ensure that `stop()` is called when you're done with the `ThreadedEventLoop`, either explicitly or by using it as a context manager.
    4. Remember that coroutines scheduled with `run_coroutine` run in the separate thread. Be cautious about shared state and race conditions.
    5. The `ThreadedEventLoop` is designed for long-running operations. For short-lived async operations, consider using `asyncio.run()` instead.

    ## Note on Error Handling

    Errors that occur within coroutines or functions scheduled on the `ThreadedEventLoop` are captured in the returned `Future` objects. Always check for exceptions when getting results from these futures:

    ```python
    future = tel.run_coroutine(some_coroutine())
    try:
        result = future.result()
    except Exception as e:
        print(f"An error occurred: {e}")
    ```

    By following these guidelines and using the provided methods, you can safely integrate asynchronous operations into synchronous code or isolate certain async operations in a separate thread.
    """

    def __init__(self):
        self._loop: AbstractEventLoop = asyncio.new_event_loop()
        self._thread: Optional[threading.Thread] = None
        self._running: bool = False

    def start(self) -> None:
        """Start the event loop in a separate thread."""
        if self._running:
            return
        self._running = True
        self._thread = threading.Thread(target=self._run_event_loop, daemon=True)
        self._thread.start()

    def stop(self) -> None:
        """Stop the event loop and wait for the thread to finish."""
        if not self._running:
            return
        self._running = False
        self._loop.call_soon_threadsafe(self._loop.stop)
        if self._thread:
            self._thread.join()
        self._thread = None

    def _run_event_loop(self) -> None:
        """Set the event loop for this thread and run it."""
        asyncio.set_event_loop(self._loop)
        self._loop.run_forever()
        self._loop.close()

    def run_coroutine(self, coro: Coroutine[Any, Any, T]) -> asyncio.Future[T]:
        """Schedule a coroutine to run in this event loop."""
        return asyncio.run_coroutine_threadsafe(coro, self._loop)  # type: ignore

    def run_in_executor(self, func: Callable[..., T], *args: Any) -> asyncio.Future[T]:
        """Run a synchronous function in the default executor of this event loop."""
        return self._loop.run_in_executor(None, func, *args)

    @property
    def is_running(self) -> bool:
        """Check if the event loop is running."""
        return self._running

    def __enter__(self) -> "ThreadedEventLoop":
        self.start()
        return self

    def __exit__(self, exc_type, exc_val, exc_tb) -> None:
        self.stop()


async def run_workflow(req: RunJobRequest) -> AsyncGenerator[Any, None]:
    import nodetool.nodes.comfy
    import nodetool.nodes.huggingface
    import nodetool.nodes.nodetool
    import nodetool.nodes.openai
    import nodetool.nodes.replicate

    context = ProcessingContext(
        user_id=req.user_id,
        auth_token=req.auth_token,
        workflow_id=req.workflow_id,
        # queue=Queue(),
    )

    if req.workflow_id:
        workflow = await context.get_workflow(req.workflow_id)
        req.graph = workflow.graph
    else:
        assert req.graph is not None, "Graph is required"

    job = await context.create_job(req)
    runner = WorkflowRunner(job_id=job.id)

    async def run():
        try:
            await runner.run(req, context)
        except Exception as e:
            log.exception(e)
            context.post_message(Error(error=str(e)))

    with ThreadedEventLoop() as tel:
        # Schedule the run coroutine in the threaded event loop
        run_future = tel.run_coroutine(run())

        try:
            while runner.is_running():
                # You can run database operations in the threaded event loop if they're blocking
                # job_status_future = tel.run_in_executor(check_job_status, job.id)
                # job_status = await job_status_future

                job = await context.get_job(job.id)
                if job.status == "cancelled":
                    runner.cancel()
                    context.is_cancelled = True

                if context.has_messages():
                    msg = await context.pop_message_async()
                    if isinstance(msg, Error):
                        raise Exception(msg.error)
                    yield msg
                else:
                    await asyncio.sleep(0.1)

            # Ensure all remaining messages are processed
            while context.has_messages():
                msg = await context.pop_message_async()
                yield msg

        except Exception as e:
            log.exception(e)
            # Ensure the run coroutine is cancelled if an exception occurs
            run_future.cancel()
            runner.cancel()
            context.is_cancelled = True

        # Wait for the run coroutine to complete
        try:
            print(run_future.result())
        except asyncio.CancelledError:
            pass


if __name__ == "__main__":
    workflow = load_example("Two Stage Stable Diffusion.json")

    req = RunJobRequest(
        user_id="1",
        auth_token="token",
        graph=workflow.graph,
    )

    async def run():
        async for msg in run_workflow(req):
            print(msg, end="")

    asyncio.run(run())
