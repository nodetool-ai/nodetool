import asyncio
from enum import Enum
import json
import time
import uuid
import msgpack
from typing import Any
from anthropic import BaseModel
from fastapi import WebSocket, WebSocketDisconnect
from nodetool.common.environment import Environment
from nodetool.types.job import JobUpdate
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.workflow_runner import WorkflowRunner
from nodetool.api.types.wrap_primitive_types import wrap_primitive_types
from nodetool.workflows.threaded_event_loop import ThreadedEventLoop
from nodetool.workflows.types import Error

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
        job_id (str | None): The ID of the current job.
        runner (WorkflowRunner | None): The workflow runner for job execution.
        mode (WebSocketMode): The current mode for WebSocket communication.
    """

    websocket: WebSocket | None = None
    context: ProcessingContext | None = None
    active_job: RunJobRequest | None = None
    event_loop: ThreadedEventLoop | None = None
    job_id: str | None = None
    runner: WorkflowRunner | None = None
    mode: WebSocketMode = WebSocketMode.BINARY

    def __init__(
        self,
    ):
        """
        Initializes a new instance of the WebSocketRunner class.
        """
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
        if self.event_loop:
            try:
                self.event_loop.stop()
            except Exception as e:
                log.error(f"Error cancelling active job during disconnect: {e}")
        if self.websocket:
            try:
                await self.websocket.close()
                log.info("WebSocket closed successfully")
            except Exception as e:
                log.error(f"Error closing WebSocket: {e}")
        self.websocket = None
        self.event_loop = None
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

            context = ProcessingContext(
                user_id=req.user_id,
                auth_token=req.auth_token,
                workflow_id=req.workflow_id,
                endpoint_url=self.websocket.url,
                encode_assets_as_base64=self.mode == WebSocketMode.TEXT,
            )
            self.event_loop = ThreadedEventLoop()

            # Create ThreadedEventLoop instance
            with self.event_loop as tel:

                async def run():
                    try:
                        if req.graph is None:
                            log.info(f"Loading workflow graph for {req.workflow_id}")
                            workflow = await context.get_workflow(req.workflow_id)
                            req.graph = workflow.graph
                        assert self.runner, "Runner is not set"
                        await self.runner.run(req, context)
                    except Exception as e:
                        log.exception(e)
                        context.post_message(
                            JobUpdate(job_id=self.job_id, status="failed", error=str(e))
                        )

                run_future = tel.run_coroutine(run())

                try:
                    while self.runner.is_running():
                        if context.has_messages():
                            msg = await context.pop_message_async()
                            if isinstance(msg, Error):
                                raise Exception(msg.error)

                            msg_dict = msg.model_dump()
                            if req.explicit_types and "result" in msg_dict:
                                msg_dict["result"] = wrap_primitive_types(
                                    msg_dict["result"]
                                )

                            await self.send_message(msg_dict)
                            log.debug(f"Sent message for job {self.job_id}: {msg.type}")
                        else:
                            await asyncio.sleep(0.1)

                    # Process remaining messages
                    while context.has_messages():
                        msg = await context.pop_message_async()
                        msg_dict = msg.model_dump()
                        await self.send_message(msg_dict)

                except Exception as e:
                    log.exception(e)
                    run_future.cancel()
                    await self.send_job_update("failed", str(e))

                try:
                    run_future.result()
                except Exception as e:
                    log.error(f"An error occurred during workflow execution: {e}")
                    await self.send_job_update("failed", str(e))

            total_time = time.time() - start_time
            log.info(
                f"Finished job {self.job_id} - Total time: {total_time:.2f} seconds"
            )

        except Exception as e:
            log.exception(f"Error in job {self.job_id}: {e}")
            await self.send_job_update("failed", str(e))

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
        if self.event_loop:
            if self.event_loop:
                self.event_loop.stop()
                log.info(f"Cancelled event loop for job: {self.job_id}")

            await self.send_job_update("cancelled")
            self.event_loop = None
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
            if self.event_loop:
                log.warning("Attempted to start a job while another is running")
                return {"error": "A job is already running"}
            req = RunJobRequest(**command.data)
            log.info(f"Starting workflow: {req.workflow_id}")
            self.active_job = req
            asyncio.create_task(self.run_job(req))
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
