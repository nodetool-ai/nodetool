import asyncio
from enum import Enum
import json
import time
import uuid
from anthropic import BaseModel
from fastapi import WebSocket, WebSocketDisconnect

from nodetool.common.environment import Environment
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.run_workflow import run_workflow
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.workflow_runner import WorkflowRunner

log = Environment.get_logger()


class CommandType(str, Enum):
    RUN_JOB = "run_job"
    CANCEL_JOB = "cancel_job"
    GET_STATUS = "get_status"


class WebSocketCommand(BaseModel):
    command: CommandType
    data: dict


class WebSocketRunner:
    websocket: WebSocket | None = None
    context: ProcessingContext | None = None
    active_job: asyncio.Task | None = None
    job_id: str | None = None
    runner: WorkflowRunner | None = None

    async def connect(self, websocket: WebSocket):
        """Establish the WebSocket connection."""
        await websocket.accept()
        self.websocket = websocket

    async def disconnect(self):
        """Close the WebSocket connection and cancel any active job."""
        if self.active_job:
            self.active_job.cancel()
        if self.websocket:
            await self.websocket.close()
        self.websocket = None
        self.active_job = None
        self.job_id = None

    async def run_job(self, req: RunJobRequest):
        """Run a job based on the provided RunJobRequest."""
        if not self.websocket:
            raise ValueError("WebSocket is not connected")

        start_time = time.time()
        self.job_id = uuid.uuid4().hex
        self.runner = WorkflowRunner(job_id=self.job_id)
        api_client = Environment.get_nodetool_api_client(
            user_id=req.user_id, auth_token=req.auth_token, api_url=req.api_url
        )

        self.context = ProcessingContext(
            user_id=req.user_id,
            auth_token=req.auth_token,
            workflow_id=req.workflow_id,
            api_client=api_client,
        )

        print("Running job: ", self.job_id)
        async for msg in run_workflow(req, self.runner, self.context):
            await self.websocket.send_text(msg.model_dump_json())

        total_time = time.time() - start_time
        log.info(f"Finished job {self.job_id} - Total time: {total_time:.2f} seconds")

        # TODO: Implement bookkeeping for credits used
        self.active_job = None
        self.job_id = None

    async def cancel_job(self):
        """Cancel the active job if one exists."""
        print("Cancelling job")
        if self.active_job:
            if self.runner:
                self.runner.cancel()
            if self.context:
                self.context.is_cancelled = True
            # self.active_job.cancel()
            self.active_job = None
            self.job_id = None
            return {"message": "Job cancelled"}
        return {"error": "No active job to cancel"}

    def get_status(self):
        """Get the current status of job execution."""
        return {
            "status": "running" if self.active_job else "idle",
            "job_id": self.job_id,
        }

    async def handle_command(self, command: WebSocketCommand):
        """Handle incoming WebSocket commands."""
        if command.command == CommandType.RUN_JOB:
            if self.active_job:
                return {"error": "A job is already running"}
            req = RunJobRequest(**command.data)
            log.info(f"Starting workflow: {req.workflow_id}")
            self.active_job = asyncio.create_task(self.run_job(req))
            return {"message": "Job started"}
        elif command.command == CommandType.CANCEL_JOB:
            return await self.cancel_job()
        elif command.command == CommandType.GET_STATUS:
            return self.get_status()
        else:
            return {"error": "Unknown command"}

    async def run(self, websocket: WebSocket):
        """Main method to run the WorkflowRunner."""
        await self.connect(websocket)
        try:
            while True:
                assert self.websocket, "WebSocket is not connected"
                data = await self.websocket.receive_text()
                command = WebSocketCommand(**json.loads(data))
                response = await self.handle_command(command)
                await self.websocket.send_text(json.dumps(response))
        except WebSocketDisconnect:
            log.info("WebSocket disconnected")
        except Exception as e:
            log.error(f"WebSocket error: {str(e)}")
        finally:
            await self.disconnect()
