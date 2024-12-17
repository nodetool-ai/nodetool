import os
import dotenv

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


runpod.serverless.start({"handler": async_generator_handler})

# For local testing
if False:
    os.environ["ENV"] = "production"
    workflow = {
        "id": "image_enhance",
        "auth_token": "1234567890",
        "access": "public",
        "created_at": "2024-10-19T19:08:03.772840",
        "updated_at": "2024-10-19T19:08:03.772863",
        "name": "Image Enhance",
        "description": "",
        "tags": ["image", "start"],
        "thumbnail": "",
        "thumbnail_url": "/examples/image_enhance.jpg",
        "graph": {
            "nodes": [
                {
                    "id": "3",
                    "parent_id": None,
                    "type": "nodetool.workflows.base_node.Preview",
                    "data": {"name": "image_output_2024-07-06"},
                    "ui_properties": {
                        "selected": False,
                        "position": {"x": 839, "y": 394},
                        "zIndex": 0,
                        "width": 214,
                        "height": 211,
                        "selectable": True,
                    },
                },
                {
                    "id": "6",
                    "parent_id": None,
                    "type": "nodetool.image.enhance.Color",
                    "data": {"factor": 1.4},
                    "ui_properties": {
                        "position": {"x": 600, "y": 444},
                        "zIndex": 0,
                        "width": 200,
                        "selectable": True,
                    },
                },
                {
                    "id": "97877",
                    "parent_id": None,
                    "type": "nodetool.constant.Image",
                    "data": {
                        "value": {
                            "uri": "https://www.mauritshuis.nl/media/rgxggmkv/vermeer-meisje-met-de-parel-mh670-mauritshuis-den-haag.jpg?center=0.44178550792733645,0.47243107769423559&mode=crop&width=1200&height=0&rnd=133018598924500000&quality=70",
                            "type": "image",
                        }
                    },
                    "ui_properties": {
                        "position": {"x": 50, "y": 293},
                        "zIndex": 0,
                        "width": 200,
                        "selectable": True,
                    },
                },
            ],
            "edges": [
                {
                    "id": "27594e37-fde4-400f-9e5f-60f90ef03c30",
                    "source": "97877",
                    "sourceHandle": "output",
                    "target": "6",
                    "targetHandle": "image",
                    "ui_properties": {"className": "image"},
                },
                {
                    "id": "380ae2ba-c21e-4460-b411-4853fae085d4",
                    "source": "6",
                    "sourceHandle": "output",
                    "target": "3",
                    "targetHandle": "value",
                    "ui_properties": {"className": "image"},
                },
            ],
        },
        "input_schema": None,
        "output_schema": None,
    }

    async def main():
        async for msg in async_generator_handler({"input": workflow}):
            print(msg)

    asyncio.run(main())
