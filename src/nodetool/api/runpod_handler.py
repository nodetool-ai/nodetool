import os
import dotenv

from nodetool.workflows.examples import load_example

dotenv.load_dotenv()

import asyncio
import runpod
from nodetool.common.environment import Environment
from nodetool.types.job import JobUpdate
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.workflow_runner import WorkflowRunner
from nodetool.workflows.threaded_event_loop import ThreadedEventLoop
from nodetool.workflows.types import Error, NodeUpdate


log = Environment.get_logger()


async def async_generator_handler(job):
    # Extract workflow data from the job input
    job_data = job.get("input", {})
    job_id = job.get("id")

    req = RunJobRequest.model_validate(job_data)

    # Create processing context and workflow runner
    context = ProcessingContext(
        user_id=req.user_id,
        auth_token=req.auth_token,
        workflow_id=req.workflow_id,
        upload_assets_to_s3=True,
    )

    runner = WorkflowRunner(job_id=job_id)
    event_loop = ThreadedEventLoop()

    # Run workflow in thread
    with event_loop as tel:

        async def run():
            try:
                if req.graph is None:
                    workflow = await context.get_workflow(req.workflow_id)
                    req.graph = workflow.graph
                await runner.run(req, context)
            except Exception as e:
                log.exception(e)
                context.post_message(
                    JobUpdate(job_id=job_id, status="failed", error=str(e))
                )

        run_future = tel.run_coroutine(run())

        while runner.is_running():
            if context.has_messages():
                msg = await context.pop_message_async()

                # Convert message to dict and yield
                msg_dict = msg.model_dump()
                print(msg_dict)

                yield msg_dict

                if isinstance(msg, Error):
                    return

                if isinstance(msg, JobUpdate) and msg.status == "failed":
                    return

            else:
                await asyncio.sleep(0.1)

        # Process remaining messages
        while context.has_messages():
            msg = await context.pop_message_async()
            msg_dict = msg.model_dump()
            yield msg_dict

        run_future.result()


#     os.environ["ENV"] = "production"
#     workflow = load_example("Stable Diffusion in Comfy.json").model_dump()

#     async def main():
#         async for msg in async_generator_handler({"input": workflow}):
#             print(msg)

#     asyncio.run(main())

runpod.serverless.start({"handler": async_generator_handler})
