from queue import Queue
from nodetool.common.environment import Environment
from nodetool.workflows.run_job_request import RunJobRequest

import asyncio
import threading
import time
from sys import stdout

log = Environment.get_logger()


def run_workflow(req: RunJobRequest, capabilities: list[str]):
    from nodetool.workflows.types import Error, WorkflowUpdate
    from nodetool.workflows.processing_context import (
        ProcessingContext,
    )
    from nodetool.workflows.workflow_runner import WorkflowRunner

    context = ProcessingContext(
        user_id=req.user_id,
        auth_token=req.auth_token,
        workflow_id=req.workflow_id,
        queue=Queue(),
        capabilities=capabilities,
    )

    loop = asyncio.get_event_loop()
    loop.set_debug(True)
    runner = WorkflowRunner()

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
                elif isinstance(msg, WorkflowUpdate):
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
