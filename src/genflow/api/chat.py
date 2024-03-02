#!/usr/bin/env python

import uuid
from fastapi import APIRouter, WebSocket
from starlette.websockets import WebSocketDisconnect
from genflow.common.chat import process_message
from genflow.metadata.types import MessageTextContent, ThreadMessage
from genflow.models.thread import Thread
from genflow.workflows.processing_context import ProcessingContext
from genflow.models.user import User
from genflow.common.environment import Environment
from fastapi import APIRouter
from genflow.models.user import User
from genflow.common.environment import Environment

log = Environment.get_logger()
router = APIRouter(prefix="/api/chat", tags=["chat"])


async def websocket_endpoint(ws: WebSocket):
    """
    WebSocket version of the send_message endpoint.
    """
    await ws.accept()

    msg = await ws.receive_json()

    if "assistant_id" not in msg:
        log.info("Assistant ID not found")
        await ws.send_json({"error": "Assistant ID not found"})
        return

    if "auth_token" not in msg:
        log.info("Auth token not found")
        await ws.send_json({"error": "Auth token not found"})
        return

    assistant_id = msg["assistant_id"]
    user = User.find_by_auth_token(msg["auth_token"])

    if user is None:
        log.info("User not found")
        await ws.send_json({"error": "User not found"})
        return

    log.info(f"User {user.id} connected to assistant {assistant_id}")

    if "thread_id" in msg and msg["thread_id"] is not None:
        thread = Thread.get(msg["thread_id"])
        if thread is None:
            log.info(f"Thread {msg['thread_id']} not found")
            await ws.send_json({"error": "Thread not found"})
            return
    else:
        thread = Thread.create(
            id=uuid.uuid4().hex, assistant_id=assistant_id, user_id=user.id
        )

    await ws.send_json({"thread_id": thread.id})

    context = ProcessingContext(user_id=user.id, auth_token=user.auth_token)

    try:
        while True:
            data = await ws.receive_json()
            res = await process_message(context, thread, data["text"])
            assert res.content
            content = MessageTextContent(text=res.content)
            await ws.send_json(
                ThreadMessage(role=res.role, content=[content]).model_dump()
            )

    except WebSocketDisconnect:
        log.info("Chat WebSocket disconnected")
