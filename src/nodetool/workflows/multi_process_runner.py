import multiprocessing
from queue import Empty
import msgpack
from typing import Any, AsyncGenerator
import asyncio

from nodetool.api.types.wrap_primitive_types import wrap_primitive_types
from nodetool.common.environment import Environment
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.workflow_runner import WorkflowRunner
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.types import Error, ProcessingMessage
from nodetool.types.job import JobUpdate


class MultiprocessRunner:
    def __init__(self, req: RunJobRequest):
        self.req = req
        self.queue = multiprocessing.Queue()
        self.process = multiprocessing.Process(
            target=self._run_workflow, args=(req, self.queue)
        )

    def start_workflow(self):
        self.process.start()

    @staticmethod
    def _run_workflow(
        req: RunJobRequest,
        queue: multiprocessing.Queue,
    ):
        async def run():
            runner = WorkflowRunner(job_id=req.workflow_id)
            context = ProcessingContext(
                user_id=req.user_id,
                auth_token=req.auth_token,
                workflow_id=req.workflow_id,
                message_queue=queue,
            )
            if Environment.is_production():
                res = await context.api_client.post(
                    "api/auth/verify", json={"token": req.auth_token}
                )
                if res.json()["valid"] == False:
                    raise ValueError("Invalid auth token")

            if req.graph is None:
                workflow = await context.get_workflow(req.workflow_id)
                req.graph = workflow.graph

            try:
                await runner.run(req, context)
            except Exception as e:
                queue.put(Error(error=str(e)))

        asyncio.run(run())

    async def get_messages(self) -> AsyncGenerator[bytes, None]:
        while True:
            try:
                msg = self.queue.get(timeout=0.1)
                if msg is None:
                    break

                msg_dict = msg.model_dump()

                # Only wrap the result if explicit_types is True
                if self.req.explicit_types and "result" in msg_dict:
                    msg_dict["result"] = wrap_primitive_types(msg_dict["result"])

                yield msgpack.packb(msg_dict, use_bin_type=True)  # type: ignore
            except Empty:
                await asyncio.sleep(0.1)

    def cancel_workflow(self):
        if self.process and self.process.is_alive():
            self.process.terminate()
            self.process.join()

        if self.req:
            self.queue.put(JobUpdate(job_id=self.req.workflow_id, status="cancelled"))

    def is_running(self):
        return self.process and self.process.is_alive()

    def cleanup(self):
        if self.process:
            self.process.terminate()
            self.process.join()
        self.queue.close()
