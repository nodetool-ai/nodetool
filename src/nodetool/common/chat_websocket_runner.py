"""
WebSocket-based chat runner for handling real-time chat communications.

This module provides a WebSocket implementation for managing chat sessions, supporting both
binary (MessagePack) and text (JSON) message formats. It handles:

- Real-time bidirectional communication for chat messages
- Tool execution and streaming responses
- Workflow processing with job updates
- Support for various content types (text, images, audio, video)

The main class ChatWebSocketRunner manages the WebSocket connection lifecycle and message
processing, including:
- Connection management
- Message reception and parsing
- Chat history tracking
- Response streaming
- Tool execution
- Workflow processing

Example:
    runner = ChatWebSocketRunner()
    await runner.run(websocket)
"""

import logging
import traceback
import uuid
import json
import msgpack
from typing import Any, List
from enum import Enum

from fastapi import WebSocket

from nodetool.chat import tools
from nodetool.chat.chat import Chunk, generate_messages, run_tool
from nodetool.metadata.types import (
    AudioRef,
    DataframeRef,
    FunctionModel,
    ImageRef,
    Message,
    MessageAudioContent,
    MessageVideoContent,
    Provider,
    ToolCall,
    VideoRef,
)
from nodetool.metadata.types import MessageImageContent, MessageTextContent
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.run_workflow import run_workflow
from nodetool.workflows.workflow_runner import WorkflowRunner
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.chat.chat import AVAILABLE_CHAT_TOOLS_BY_NAME

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
                if message.workflow_id:
                    response_message = await self.process_messages_for_workflow()
                else:
                    response_message = await self.process_messages()

                # Create a new message from the result

                # Add the response to chat history
                self.chat_history.append(response_message)

                # Send the response back to the client
                await self.send_message(response_message.model_dump())

            except Exception as e:
                log.error(f"Error processing message: {str(e)}")
                traceback.print_exc()
                error_message = {"type": "error", "message": str(e)}
                await self.send_message(error_message)
                # Optionally, you can decide whether to break the loop or continue
                # break

    async def process_messages(self) -> Message:
        last_message = self.chat_history[-1]

        processing_context = ProcessingContext(
            user_id=last_message.user_id or "",
            auth_token=last_message.auth_token or "",
        )

        content = ""
        unprocessed_messages = []

        if last_message.tools:
            selected_tools = [
                AVAILABLE_CHAT_TOOLS_BY_NAME[name] for name in last_message.tools
            ]
        else:
            selected_tools = []

        # Stream the response chunks
        while True:
            messages_to_send = self.chat_history + unprocessed_messages
            unprocessed_messages = []

            async for chunk in generate_messages(
                messages=messages_to_send,
                model=FunctionModel(
                    provider=Provider.Ollama,
                    name="llama3.2:3b",
                    repo_id="llama3.2:3b",
                ),
                tools=selected_tools,
            ):
                if isinstance(chunk, Chunk):
                    content += chunk.content
                    # Send intermediate chunks to client
                    await self.send_message(
                        {"type": "chunk", "content": chunk.content, "done": chunk.done}
                    )
                elif isinstance(chunk, ToolCall):
                    # Send tool call to client
                    await self.send_message(
                        {"type": "tool_call", "tool_call": chunk.model_dump()}
                    )

                    # Process the tool call
                    tool_result = await run_tool(
                        processing_context, chunk, selected_tools
                    )

                    print(f"Tool result: {tool_result}")

                    # Add tool messages to unprocessed messages
                    unprocessed_messages.append(
                        Message(role="assistant", tool_calls=[chunk])
                    )
                    unprocessed_messages.append(
                        Message(
                            role="tool",
                            tool_call_id=tool_result.id,
                            content=json.dumps(tool_result.result),
                        )
                    )

                    # Send tool result to client
                    await self.send_message(
                        {"type": "tool_result", "result": tool_result.model_dump()}
                    )

            # If no more unprocessed messages, we're done
            if not unprocessed_messages:
                break

        return Message(
            role="assistant",
            content=content if content else None,
        )

    async def process_messages_for_workflow(self) -> Message:
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
        result = {}
        async for update in run_workflow(
            request, workflow_runner, processing_context, use_thread=True
        ):
            await self.send_message(update)
            if update["type"] == "job_update" and update["status"] == "completed":
                result = update["result"]

        return self.create_response_message(result)

    def create_response_message(self, result: dict) -> Message:
        content = []
        for key, value in result.items():
            if isinstance(value, str):
                content.append(MessageTextContent(text=value))
            elif isinstance(value, dict):
                if value.get("type") == "image":
                    content.append(MessageImageContent(image=ImageRef(**value)))
                elif value.get("type") == "video":
                    content.append(MessageVideoContent(video=VideoRef(**value)))
                elif value.get("type") == "audio":
                    content.append(MessageAudioContent(audio=AudioRef(**value)))
                else:
                    raise ValueError(f"Unknown type: {value}")
            else:
                raise ValueError(f"Unknown type: {type(value)} {value}")
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
