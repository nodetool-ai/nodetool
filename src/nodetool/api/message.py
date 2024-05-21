#!/usr/bin/env python

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Body
from nodetool.api.utils import current_user, User
from nodetool.api.types.chat import MessageCreateRequest, MessageList
from nodetool.metadata.types import Message
from nodetool.models.message import Message as MessageModel
from nodetool.common.environment import Environment
from typing import Optional

from nodetool.models.thread import Thread


log = Environment.get_logger()
router = APIRouter(prefix="/api/messages", tags=["messages"])


@router.post("/")
async def create(
    req: MessageCreateRequest, user: User = Depends(current_user)
) -> Message:
    if req.thread_id is None:
        thread_id = Thread.create(user_id=user.id).id
    else:
        thread_id = req.thread_id
    return Message.from_model(
        MessageModel.create(
            user_id=user.id,
            thread_id=thread_id,
            tool_call_id=req.tool_call_id,
            role=req.role,
            name=req.name,
            content=req.content,
            tool_calls=req.tool_calls,
            created_at=datetime.now(),
        )
    )


@router.get("/{message_id}")
async def get(message_id: str, user: User = Depends(current_user)) -> Message:
    message = MessageModel.get(message_id)
    if message is None:
        raise HTTPException(status_code=404, detail="Message not found")
    if message.user_id != user.id:
        raise HTTPException(status_code=404, detail="Message not found")
    return Message.from_model(message)


@router.get("/")
async def index(
    thread_id: str,
    reverse: bool = False,
    user: User = Depends(current_user),
    cursor: Optional[str] = None,
    limit: int = 100,
) -> MessageList:
    messages, cursor = MessageModel.paginate(
        thread_id=thread_id, reverse=reverse, limit=limit, start_key=cursor
    )
    for message in messages:
        if message.user_id != user.id:
            raise HTTPException(status_code=404, detail="Message not found")

    return MessageList(
        next=cursor, messages=[Message.from_model(message) for message in messages]
    )
