import asyncio
import json
import os
import time
from enum import Enum
import aiohttp
import msgpack
import requests
from anthropic import BaseModel
from fastapi import WebSocket, WebSocketDisconnect
from typing import Any, Optional
from nodetool.common.environment import Environment
from nodetool.types.job import JobUpdate
from nodetool.workflows.run_job_request import RunJobRequest

log = Environment.get_logger()

FINAL_STATES = ["COMPLETED", "FAILED", "TIMED_OUT"]


class CommandType(str, Enum):
    RUN_JOB = "run_job"
    CANCEL_JOB = "cancel_job"
    GET_STATUS = "get_status"
    SET_MODE = "set_mode"


class WebSocketCommand(BaseModel):
    command: CommandType
    data: dict


class WebSocketMode(str, Enum):
    BINARY = "binary"
    TEXT = "text"


class RunPodWebSocketRunner:
    """
    Runs workflows by delegating to RunPod endpoints via WebSocket connection.

    Attributes:
        websocket (WebSocket | None): The WebSocket connection
        endpoint_id (str): The RunPod endpoint ID to use
        active_job_id (str | None): The ID of the current RunPod job
        mode (WebSocketMode): The current mode for WebSocket communication
    """

    def __init__(
        self,
        endpoint_id: str,
    ):
        self.endpoint_id = endpoint_id
        self.websocket: Optional[WebSocket] = None
        self.active_job_id: Optional[str] = None
        self.mode = WebSocketMode.BINARY
        self._should_stop = False
        self.api_key = os.getenv("RUNPOD_API_KEY")
        if not self.api_key:
            raise ValueError("RUNPOD_API_KEY environment variable is required")

    async def connect(self, websocket: WebSocket):
        """Establishes the WebSocket connection."""
        await websocket.accept()
        self.websocket = websocket
        log.info("WebSocket connection established")

    async def disconnect(self):
        """Closes the WebSocket connection and cancels any active job."""
        log.info("Disconnecting WebSocket")
        if self.active_job_id:
            await self.cancel_job()
        if self.websocket:
            try:
                await self.websocket.close()
            except Exception as e:
                log.error(f"Error closing WebSocket: {e}")
        self.websocket = None
        self.active_job_id = None
        log.info("WebSocket disconnected and resources cleaned up")

    async def send_message(self, message: dict):
        """Send a message using the current mode."""
        assert self.websocket, "WebSocket is not connected"
        try:
            if self.mode == WebSocketMode.BINARY:
                packed_message = msgpack.packb(message, use_bin_type=True)
                assert packed_message, "pack message failed"
                await self.websocket.send_bytes(packed_message)
            else:
                await self.websocket.send_text(json.dumps(message))
            log.debug(f"Sent message: {message.get('type', message)}")
        except Exception as e:
            log.error(f"Error sending message: {e}")

    async def run_job(self, req: RunJobRequest):
        """Runs a job by delegating to RunPod endpoint."""
        try:
            if not self.websocket:
                raise ValueError("WebSocket is not connected")

            start_time = time.time()
            self._should_stop = False

            # Send job to RunPod
            headers = {
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            }
            payload = {"input": req.model_dump()}

            # Start the job
            run_url = f"https://api.runpod.ai/v2/{self.endpoint_id}/run"
            async with aiohttp.ClientSession() as session:
                async with session.post(
                    run_url, headers=headers, json=payload
                ) as response:
                    response.raise_for_status()
                    job = await response.json()
                    self.active_job_id = job["id"]

            # Stream results
            stream_url = f"https://api.runpod.ai/v2/{self.endpoint_id}/stream/{self.active_job_id}"
            async with aiohttp.ClientSession() as session:
                while True:
                    if self._should_stop:
                        break
                    async with session.post(stream_url, headers=headers) as response:
                        job = await response.json()
                        if job["status"] in FINAL_STATES:
                            break
                        for chunk in job["stream"]:
                            message = chunk["output"]
                            await self.send_message(message)

                            if message.get("error"):
                                await self.send_job_update(
                                    "failed", str(message["error"])
                                )
                                break

            if not self._should_stop:
                await self.send_job_update("completed")

            total_time = time.time() - start_time
            log.info(
                f"Finished job {self.active_job_id} - Total time: {total_time:.2f} seconds"
            )

        except Exception as e:
            log.exception(f"Error in job {self.active_job_id}: {e}")
            await self.send_job_update("failed", str(e))
        finally:
            self.active_job_id = None

    async def send_job_update(self, status: str, error: str | None = None):
        """Sends a job status update through the WebSocket."""
        msg = {
            "type": "job_update",
            "status": status,
            "error": error,
            "job_id": self.active_job_id,
        }
        await self.send_message(msg)

    async def cancel_job(self):
        """Cancels the active RunPod job if one exists."""
        if not self.active_job_id:
            return {"error": "No active job to cancel"}

        try:
            headers = {"Authorization": f"Bearer {self.api_key}"}
            cancel_url = f"https://api.runpod.ai/v2/{self.endpoint_id}/cancel/{self.active_job_id}"
            async with aiohttp.ClientSession() as session:
                async with session.post(cancel_url, headers=headers) as response:
                    response.raise_for_status()

            self._should_stop = True
            await self.send_job_update("cancelled")
            return {"message": "Job cancelled"}
        except Exception as e:
            log.error(f"Error cancelling job: {e}")
            return {"error": f"Failed to cancel job: {str(e)}"}

    def get_status(self):
        """Gets the current status of job execution."""
        return {
            "status": "running" if self.active_job_id else "idle",
            "job_id": self.active_job_id,
        }

    async def handle_command(self, command: WebSocketCommand):
        """Handles incoming WebSocket commands."""
        log.info(f"Handling command: {command.command}")
        if command.command == CommandType.RUN_JOB:
            if self.active_job_id:
                return {"error": "A job is already running"}
            req = RunJobRequest(**command.data)
            asyncio.create_task(self.run_job(req))
            return {"message": "Job started"}
        elif command.command == CommandType.CANCEL_JOB:
            return await self.cancel_job()
        elif command.command == CommandType.GET_STATUS:
            return self.get_status()
        elif command.command == CommandType.SET_MODE:
            self.mode = WebSocketMode(command.data["mode"])
            return {"message": f"Mode set to {self.mode}"}
        else:
            return {"error": "Unknown command"}

    async def run(self, websocket: WebSocket):
        """Main method to run the WebSocket server."""
        await self.connect(websocket)
        try:
            while True:
                assert self.websocket, "WebSocket is not connected"
                message = await self.websocket.receive()

                if message["type"] == "websocket.disconnect":
                    break

                try:
                    if "bytes" in message:
                        data = msgpack.unpackb(message["bytes"])
                    elif "text" in message:
                        data = json.loads(message["text"])
                    else:
                        continue

                    command = WebSocketCommand(**data)
                    response = await self.handle_command(command)
                    await self.send_message(response)
                except Exception as e:
                    log.error(f"Error handling message: {e}")
                    await self.send_message({"error": str(e)})

        except WebSocketDisconnect:
            log.info("WebSocket disconnected")
        except Exception as e:
            log.error(f"WebSocket error: {str(e)}")
        finally:
            await self.disconnect()