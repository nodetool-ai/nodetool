import dotenv
import asyncio
from nodetool.common.environment import Environment
from nodetool.types.job import JobUpdate
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.workflow_runner import WorkflowRunner
from nodetool.workflows.threaded_event_loop import ThreadedEventLoop
from nodetool.workflows.types import Error, NodeUpdate

dotenv.load_dotenv()

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
                    "id": "4",
                    "parent_id": None,
                    "type": "nodetool.workflows.base_node.Preview",
                    "data": {"name": "image_output_2024-07-06"},
                    "ui_properties": {
                        "position": {"x": 320, "y": 50},
                        "zIndex": 0,
                        "width": 211,
                        "height": 210,
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
                    "id": "8",
                    "parent_id": None,
                    "type": "nodetool.workflows.base_node.Comment",
                    "data": {
                        "comment": [
                            {
                                "type": "paragraph",
                                "children": [
                                    {
                                        "text": "Select one of the nodes above and then click on"
                                    }
                                ],
                            },
                            {
                                "type": "paragraph",
                                "children": [
                                    {"text": "NODETOOL.IMAGE.ENHANCE to open the NodeMenu"}
                                ],
                            },
                            {
                                "type": "paragraph",
                                "children": [{"text": "in this category."}],
                            },
                        ],
                        "headline": "More Image.Enhance nodes",
                    },
                    "ui_properties": {
                        "selected": False,
                        "position": {"x": 321, "y": 615},
                        "zIndex": 0,
                        "width": 405,
                        "height": 105,
                        "selectable": True,
                    },
                },
                {
                    "id": "11",
                    "parent_id": None,
                    "type": "nodetool.image.enhance.AutoContrast",
                    "data": {"cutoff": 2},
                    "ui_properties": {
                        "position": {"x": 325.5, "y": 444},
                        "zIndex": 0,
                        "width": 200,
                        "selectable": True,
                    },
                },
                {
                    "id": "4b900c04-d29b-4466-94fa-f2cf1229115a",
                    "parent_id": None,
                    "type": "nodetool.workflows.base_node.Preview",
                    "data": {"name": "image_output_2024-07-06"},
                    "ui_properties": {
                        "selected": False,
                        "position": {"x": 591, "y": 178},
                        "zIndex": 0,
                        "width": 218,
                        "height": 216,
                        "selectable": True,
                    },
                },
                {
                    "id": "5b962592-953e-411e-9c8f-4d188607b1ad",
                    "parent_id": None,
                    "type": "nodetool.image.enhance.Sharpen",
                    "data": {},
                    "ui_properties": {
                        "position": {"x": 325.5, "y": 310},
                        "zIndex": 0,
                        "width": 200,
                        "selectable": True,
                    },
                },
                {
                    "id": "97876",
                    "parent_id": None,
                    "type": "nodetool.workflows.base_node.Comment",
                    "data": {
                        "headline": "Image Enhance",
                        "comment": [
                            {
                                "type": "paragraph",
                                "children": [
                                    {
                                        "text": "The Nodetool.Image.Enhance namespace contains nodes for basic image enhancement."
                                    }
                                ],
                            },
                            {"type": "paragraph", "children": [{"text": ""}]},
                            {
                                "type": "paragraph",
                                "children": [
                                    {
                                        "text": "Also check the Replicate.Image.Process and Replicate.Image.Upscale namespaces for more advanced image enhancement nodes."
                                    }
                                ],
                            },
                        ],
                    },
                    "ui_properties": {
                        "position": {"x": 4, "y": -138},
                        "zIndex": 0,
                        "width": 546,
                        "height": 132,
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
                    "id": "1c1ec75c-b699-4fa2-ab15-bf87bd225401",
                    "source": "97877",
                    "sourceHandle": "output",
                    "target": "5b962592-953e-411e-9c8f-4d188607b1ad",
                    "targetHandle": "image",
                    "ui_properties": {"className": "image"},
                },
                {
                    "id": "27594e37-fde4-400f-9e5f-60f90ef03c30",
                    "source": "97877",
                    "sourceHandle": "output",
                    "target": "11",
                    "targetHandle": "image",
                    "ui_properties": {"className": "image"},
                },
                {
                    "id": "a52249ae-aead-48e7-911a-7cb26faf00f2",
                    "source": "97877",
                    "sourceHandle": "output",
                    "target": "4",
                    "targetHandle": "value",
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
                {
                    "id": "5b1aa42a-bdb8-461b-bebc-58386e28fd44",
                    "source": "11",
                    "sourceHandle": "output",
                    "target": "6",
                    "targetHandle": "image",
                    "ui_properties": {"className": "image"},
                },
                {
                    "id": "20f75457-d5e0-477b-b215-94152cd30d33",
                    "source": "5b962592-953e-411e-9c8f-4d188607b1ad",
                    "sourceHandle": "output",
                    "target": "4b900c04-d29b-4466-94fa-f2cf1229115a",
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
