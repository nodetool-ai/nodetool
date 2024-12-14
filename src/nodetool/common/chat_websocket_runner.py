import logging
import uuid
import json
import msgpack
from typing import Any, List
from enum import Enum

from fastapi import WebSocket

from nodetool.metadata.types import (
    AudioRef,
    DataframeRef,
    ImageRef,
    Message,
    MessageAudioContent,
    MessageVideoContent,
    VideoRef,
)
from nodetool.metadata.types import MessageImageContent, MessageTextContent
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.run_workflow import run_workflow
from nodetool.workflows.workflow_runner import WorkflowRunner
from nodetool.workflows.processing_context import ProcessingContext

log = logging.getLogger(__name__)


class WebSocketMode(str, Enum):
    BINARY = "binary"
    TEXT = "text"


class ChatWebSocketRunner:
    def __init__(self):
        self.websocket: WebSocket | None = None
        self.chat_history: List[Message] = []
        self.mode: WebSocketMode = WebSocketMode.BINARY

    async def connect(self, websocket: WebSocket):
        await websocket.accept()
        self.websocket = websocket
        log.info("WebSocket connection established for chat")

    async def disconnect(self):
        if self.websocket:
            await self.websocket.close()
        self.websocket = None
        log.info("WebSocket disconnected for chat")

    async def run(self, websocket: WebSocket):
        await self.connect(websocket)

        assert self.websocket is not None, "WebSocket is not connected"

        while True:
            try:
                message = await self.websocket.receive()

                if message["type"] == "websocket.disconnect":
                    log.info("Received websocket disconnect message")
                    break

                if "bytes" in message:
                    data = msgpack.unpackb(message["bytes"])
                    self.mode = WebSocketMode.BINARY
                    log.debug("Received binary message")
                elif "text" in message:
                    data = json.loads(message["text"])
                    self.mode = WebSocketMode.TEXT
                    log.debug("Received text message")
                else:
                    log.warning("Received message with unknown format")
                    continue

                message = Message(**data)

                # Add the new message to chat history
                self.chat_history.append(message)

                # Process the message through the workflow
                result = await self.process_messages()

                # Create a new message from the result
                response_message = self.create_response_message(result)

                # Add the response to chat history
                self.chat_history.append(response_message)

                # Send the response back to the client
                await self.send_message(response_message.model_dump())

            except Exception as e:
                log.error(f"Error processing message: {str(e)}")
                error_message = {"type": "error", "message": str(e)}
                await self.send_message(error_message)
                # Optionally, you can decide whether to break the loop or continue
                # break

    async def process_messages(self) -> dict:
        job_id = str(uuid.uuid4())
        last_message = self.chat_history[-1]
        assert last_message.workflow_id is not None, "Workflow ID is required"

        workflow_runner = WorkflowRunner(job_id=job_id)

        processing_context = ProcessingContext(
            user_id=last_message.user_id or "",
            auth_token=last_message.auth_token or "",
            workflow_id=last_message.workflow_id,
        )

        request = RunJobRequest(
            workflow_id=last_message.workflow_id,
            messages=self.chat_history,
            graph=last_message.graph,
        )

        log.info(f"Running workflow for {last_message.workflow_id}")
        # Run the workflow
        result = {}
        async for update in run_workflow(
            request, workflow_runner, processing_context, use_thread=True
        ):
            await self.send_message(update.model_dump())
            if update.type == "job_update" and update.status == "completed":
                result = update.result

        return result

    def create_response_message(self, result: dict) -> Message:
        content = []
        for key, value in result.items():
            if isinstance(value, str):
                content.append(MessageTextContent(text=value))
            elif isinstance(value, ImageRef):
                content.append(MessageImageContent(image=value))
            elif isinstance(value, VideoRef):
                content.append(MessageVideoContent(video=value))
            elif isinstance(value, AudioRef):
                content.append(MessageAudioContent(audio=value))
            else:
                raise ValueError(f"Unknown type: {type(value)}")
        return Message(
            role="assistant",
            content=content,
            # You might want to set other fields like id, thread_id, etc.
        )

    async def send_message(self, message: dict):
        assert self.websocket, "WebSocket is not connected"
        try:
            if self.mode == WebSocketMode.BINARY:
                packed_message = msgpack.packb(message, use_bin_type=True)
                await self.websocket.send_bytes(packed_message)  # type: ignore
                log.debug(f"Sent binary message")
            else:
                await self.websocket.send_text(json.dumps(message))
                log.debug(f"Sent text message")
        except Exception as e:
            log.error(f"Error sending message: {e}")
