import asyncio
import json
import time
import uuid
from typing import Any, AsyncGenerator
from nodetool.common.environment import Environment
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.run_workflow import run_workflow
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.workflow_runner import WorkflowRunner
from nodetool.api.types.wrap_primitive_types import wrap_primitive_types

log = Environment.get_logger()


class HTTPStreamRunner:
    """
    Runs a workflow using a FastAPI streaming endpoint.

    Attributes:
        context (ProcessingContext | None): The processing context for job execution.
        job_id (str | None): The ID of the current job.
        runner (WorkflowRunner | None): The workflow runner for job execution.
    """

    context: ProcessingContext | None = None
    job_id: str | None = None
    runner: WorkflowRunner | None = None

    def __init__(
        self,
    ):
        """
        Initializes a new instance of the HTTPStreamRunner class.
        """
        pass

    async def run_job(
        self,
        req: RunJobRequest,
    ) -> AsyncGenerator[str, None]:
        """
        Runs a job based on the provided RunJobRequest and yields JSON-encoded messages.

        Args:
            req (RunJobRequest): The RunJobRequest containing job details.

        Yields:
            str: JSON-encoded messages from the job execution.
        """
        try:
            start_time = time.time()
            self.job_id = uuid.uuid4().hex
            self.runner = WorkflowRunner(job_id=self.job_id)

            log.info("Running job: %s", self.job_id)

            async for msg in run_workflow(
                req, self.runner, self.context, use_thread=True
            ):
                try:
                    msg_dict = msg.model_dump()

                    if req.explicit_types and "result" in msg_dict:
                        msg_dict["result"] = wrap_primitive_types(msg_dict["result"])

                    yield json.dumps(msg_dict) + "\n"
                except Exception as e:
                    log.exception(f"Error processing message in job {self.job_id}: {e}")
                    yield json.dumps({"error": str(e)}) + "\n"

            total_time = time.time() - start_time
            log.info(
                f"Finished job {self.job_id} - Total time: {total_time:.2f} seconds"
            )
            yield json.dumps({"type": "job_completed", "job_id": self.job_id}) + "\n"
        except Exception as e:
            log.exception(f"Error in job {self.job_id}: {e}")
            yield json.dumps(
                {"type": "job_failed", "job_id": self.job_id, "error": str(e)}
            ) + "\n"

        self.job_id = None
        self.runner = None

    async def cancel_job(self):
        """
        Cancels the active job if one exists.

        Returns:
            dict: A dictionary with a message indicating the job was cancelled, or an error if no active job exists.
        """
        if self.runner:
            await asyncio.sleep(3.0)
            self.job_id = None
            self.runner = None
            return {"message": "Job cancelled"}
        return {"error": "No active job to cancel"}

    def get_status(self):
        """
        Gets the current status of job execution.

        Returns:
            dict: A dictionary with the status ("running" or "idle") and the job ID.
        """
        return {
            "status": "running" if self.runner else "idle",
            "job_id": self.job_id,
        }
