import asyncio
import base64
from enum import Enum
import json
import time
import uuid
import msgpack
from typing import Any
from anthropic import BaseModel
from fastapi import WebSocket, WebSocketDisconnect
from nodetool.common.environment import Environment
from nodetool.metadata.types import AssetRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.run_workflow import run_workflow
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.workflow_runner import WorkflowRunner
from nodetool.api.types.wrap_primitive_types import wrap_primitive_types

log = Environment.get_logger()


class CommandType(str, Enum):
    RUN_JOB = "run_job"
    CANCEL_JOB = "cancel_job"
    GET_STATUS = "get_status"
    SET_MODE = "set_mode"  # New command type


class WebSocketCommand(BaseModel):
    command: CommandType
    data: dict


class WebSocketMode(str, Enum):
    BINARY = "binary"
    TEXT = "text"


class WebSocketRunner:
    """
    Runs a workflow using a WebSocket connection.

    Attributes:
        websocket (WebSocket | None): The WebSocket connection.
        context (ProcessingContext | None): The processing context for job execution.
        active_job (asyncio.Task | None): The currently active job.
        use_thread (bool): Flag indicating whether to use a separate thread for job execution.
        job_id (str | None): The ID of the current job.
        runner (WorkflowRunner | None): The workflow runner for job execution.
        pre_run_hook (Any): A hook function to be executed before running a job.
        post_run_hook (Any): A hook function to be executed after running a job.
        mode (WebSocketMode): The current mode for WebSocket communication.
    """

    websocket: WebSocket | None = None
    context: ProcessingContext | None = None
    active_job: asyncio.Task | None = None
    use_thread: bool = False
    job_id: str | None = None
    runner: WorkflowRunner | None = None
    pre_run_hook: Any
    post_run_hook: Any
    mode: WebSocketMode = WebSocketMode.BINARY

    def __init__(
        self,
        pre_run_hook: Any = None,
        post_run_hook: Any = None,
        use_thread: bool = False,
    ):
        """
        Initializes a new instance of the WebSocketRunner class.

        Args:
            pre_run_hook (Any, optional): A hook function to be executed before running a job.
            post_run_hook (Any, optional): A hook function to be executed after running a job.
            use_thread (bool, optional): Flag indicating whether to use a separate thread for job execution.
        """
        self.pre_run_hook = pre_run_hook
        self.post_run_hook = post_run_hook
        self.use_thread = use_thread
        self.mode = WebSocketMode.BINARY

    async def connect(self, websocket: WebSocket):
        """
        Establishes the WebSocket connection.

        Args:
            websocket (WebSocket): The WebSocket connection.
        """
        await websocket.accept()
        self.websocket = websocket
        log.info("WebSocket connection established")

    async def disconnect(self):
        """
        Closes the WebSocket connection and cancels any active job.
        """
        log.info("Disconnecting WebSocket")
        if self.active_job:
            try:
                self.active_job.cancel()
                log.info("Active job cancelled during disconnect")
            except Exception as e:
                log.error(f"Error cancelling active job during disconnect: {e}")
        if self.websocket:
            try:
                await self.websocket.close()
                log.info("WebSocket closed successfully")
            except Exception as e:
                log.error(f"Error closing WebSocket: {e}")
        self.websocket = None
        self.active_job = None
        self.job_id = None
        log.info("WebSocket disconnected and resources cleaned up")

    async def run_job(
        self,
        req: RunJobRequest,
    ):
        """
        Runs a job based on the provided RunJobRequest.

        Args:
            req (RunJobRequest): The RunJobRequest containing job details.

        Raises:
            ValueError: If WebSocket is not connected.
        """
        try:
            if not self.websocket:
                raise ValueError("WebSocket is not connected")
            start_time = time.time()
            self.job_id = uuid.uuid4().hex
            self.runner = WorkflowRunner(job_id=self.job_id)

            log.info(f"Starting job execution: {self.job_id}")
            if self.pre_run_hook:
                log.debug("Executing pre-run hook")
                self.pre_run_hook()

            context = ProcessingContext(
                user_id=req.user_id,
                auth_token=req.auth_token,
                workflow_id=req.workflow_id,
                endpoint_url=self.websocket.url,
            )

            async for msg in run_workflow(req, self.runner, context, use_thread=True):
                try:
                    if self.mode == WebSocketMode.TEXT:
                        if msg.type == "job_update":
                            if msg.status == "completed":
                                result = msg.result
                                for key, value in result.items():
                                    if isinstance(value, AssetRef) and value.data:
                                        if isinstance(value.data, bytes):
                                            value.uri = f"data:application/octet-stream;base64,{base64.b64encode(value.data).decode('utf-8')}"
                                        elif isinstance(value.data, list):
                                            # TODO: handle multiple assets
                                            value.uri = f"data:application/octet-stream;base64,{base64.b64encode(value.data[0]).decode('utf-8')}"
                                        value.data = None
                    msg_dict = msg.model_dump()

                    # Only wrap the result if explicit_types is True
                    if req.explicit_types and "result" in msg_dict:
                        msg_dict["result"] = wrap_primitive_types(msg_dict["result"])

                    await self.send_message(msg_dict)
                    log.debug(f"Sent message for job {self.job_id}: {msg.type}")
                except Exception as e:
                    log.exception(f"Error processing message in job {self.job_id}: {e}")

            if self.post_run_hook:
                log.debug("Executing post-run hook")
                self.post_run_hook()

            total_time = time.time() - start_time
            log.info(
                f"Finished job {self.job_id} - Total time: {total_time:.2f} seconds"
            )
            # TODO: Update the job model with the final status
        except Exception as e:
            log.exception(f"Error in job {self.job_id}: {e}")
            await self.send_job_update("failed", str(e))

        # TODO: Implement bookkeeping for credits used
        self.active_job = None
        self.job_id = None
        log.info(f"Job {self.job_id} resources cleaned up")

    async def send_message(self, message: dict):
        """Send a message using the current mode."""
        assert self.websocket, "WebSocket is not connected"
        try:
            if self.mode == WebSocketMode.BINARY:
                packed_message = msgpack.packb(message, use_bin_type=True)
                await self.websocket.send_bytes(packed_message)  # type: ignore
                log.debug(f"Sent binary message: {message.get('type', message)}")
            else:
                await self.websocket.send_text(json.dumps(message))
                log.debug(f"Sent text message: {message.get('type', message)}")
        except Exception as e:
            log.error(f"Error sending message: {e}")

    async def send_job_update(self, status: str, error: str | None = None):
        msg = {
            "type": "job_update",
            "status": status,
            "error": error,
            "job_id": self.job_id,
        }
        await self.send_message(msg)

    async def cancel_job(self):
        """
        Cancels the active job if one exists.

        Returns:
            dict: A dictionary with a message indicating the job was cancelled, or an error if no active job exists.
        """
        log.info(f"Attempting to cancel job: {self.job_id}")
        if self.active_job:
            if self.runner:
                self.runner.cancel()
                log.info(f"Cancelled runner for job: {self.job_id}")
            # give the runner a chance to cancel
            await asyncio.sleep(1.0)
            if self.active_job:
                self.active_job.cancel()
                log.info(f"Cancelled active job task: {self.job_id}")
            self.active_job = None
            self.job_id = None
            return {"message": "Job cancelled"}
        log.warning("No active job to cancel")
        return {"error": "No active job to cancel"}

    def get_status(self):
        """
        Gets the current status of job execution.

        Returns:
            dict: A dictionary with the status ("running" or "idle") and the job ID.
        """
        return {
            "status": self.runner.status if self.runner else "idle",
            "job_id": self.job_id,
        }

    async def handle_command(self, command: WebSocketCommand):
        """
        Handles incoming WebSocket commands.

        Args:
            command (WebSocketCommand): The WebSocket command to handle.

        Returns:
            dict: A dictionary with the response to the command.
        """
        log.info(f"Handling command: {command.command}")
        if command.command == CommandType.RUN_JOB:
            if self.active_job:
                log.warning("Attempted to start a job while another is running")
                return {"error": "A job is already running"}
            req = RunJobRequest(**command.data)
            log.info(f"Starting workflow: {req.workflow_id}")
            self.active_job = asyncio.create_task(self.run_job(req))
            return {"message": "Job started"}
        elif command.command == CommandType.CANCEL_JOB:
            return await self.cancel_job()
        elif command.command == CommandType.GET_STATUS:
            status = self.get_status()
            log.debug(f"Current status: {status}")
            return status
        elif command.command == CommandType.SET_MODE:
            new_mode = WebSocketMode(command.data["mode"])
            self.mode = new_mode
            log.info(f"WebSocket mode set to: {new_mode}")
            return {"message": f"Mode set to {new_mode}"}
        else:
            log.warning(f"Unknown command received: {command.command}")
            return {"error": "Unknown command"}

    async def run(self, websocket: WebSocket):
        """
        Main method to run the WorkflowRunner.

        Args:
            websocket (WebSocket): The WebSocket connection.
        """
        await self.connect(websocket)
        try:
            while True:
                assert self.websocket, "WebSocket is not connected"
                message = await self.websocket.receive()
                if message["type"] == "websocket.disconnect":
                    log.info("Received websocket disconnect message")
                    break
                if "bytes" in message:
                    data = msgpack.unpackb(message["bytes"])  # type: ignore
                    log.debug("Received binary message")
                elif "text" in message:
                    data = json.loads(message["text"])
                    log.debug("Received text message")
                else:
                    log.warning("Received message with unknown format")
                    continue

                command = WebSocketCommand(**data)
                response = await self.handle_command(command)
                await self.send_message(response)
        except WebSocketDisconnect:
            log.info("WebSocket disconnected")
        except Exception as e:
            log.error(f"WebSocket error: {str(e)}")
            log.exception(e)
        finally:
            await self.disconnect()
