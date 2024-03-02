#!/usr/bin/env python

import uuid
from fastapi import APIRouter, Depends, HTTPException
from genflow.api.models.models import (
    Assistant,
    AssistantCreateRequest,
    AssistantList,
    AssistantUpdateRequest,
)
from genflow.api.utils import current_user, User
from genflow.common.environment import Environment
from genflow.common.openai_helpers import GPTModel
from genflow.models.assistant import Assistant as AssistantModel

log = Environment.get_logger()
router = APIRouter(prefix="/api/assistants", tags=["assistants"])


def find_assistant_for(user_id: str, id: str):
    """
    Find an assistant for the given user ID and assistant ID.

    Args:
        user_id (str): The ID of the user.
        id (str): The ID of the assistant.

    Returns:
        AssistantModel: The assistant object.

    Raises:
        HTTPException: If the assistant is not found or not accessible.
    """
    assistant = AssistantModel.get(id)

    if assistant is None:
        log.info("Assistant not found: %s", id)
        raise HTTPException(status_code=404, detail="Assistant not found")
    if assistant.user_id != user_id:
        log.info("Assistant not accessible: %s", id)
        raise HTTPException(status_code=404, detail="Assistant not found")

    return assistant


@router.get("/")
async def index(
    cursor: str | None = None,
    page_size: int = 100,
    user: User = Depends(current_user),
) -> AssistantList:
    """
    Returns all assistants for a given user or workflow.
    """
    assistants, next_cursor = AssistantModel.paginate(
        user_id=user.id,
        limit=page_size,
        start_key=cursor,
    )

    return AssistantList(
        next=next_cursor,
        assistants=[Assistant.from_model(a) for a in assistants],
    )


@router.get("/{id}")
async def get(id: str, user: User = Depends(current_user)) -> Assistant:
    """
    Returns the assistant for the given id.
    """
    assistant = find_assistant_for(user.id, id)

    return Assistant.from_model(assistant)


@router.put("/{id}")
async def update(
    id: str,
    req: AssistantUpdateRequest,
    user: User = Depends(current_user),
) -> Assistant:
    """
    Updates the assistant for the given id.
    """
    assistant = find_assistant_for(user.id, id)

    assistant.update(
        name=req.name,
        description=req.description,
        instructions=req.instructions,
        workflows=req.workflows,
        nodes=req.nodes,
        assets=req.assets,
        # model=req.model,
    )
    return Assistant.from_model(assistant)


@router.delete("/{id}")
async def delete(id: str, user: User = Depends(current_user)):
    """
    Deletes the assistant for the given id.
    """
    assistant = find_assistant_for(user.id, id)
    assistant.delete()
    client = Environment.get_openai_client()
    await client.beta.assistants.delete(assistant_id=id)
    log.info("Deleted assistant: %s", id)


@router.post("/")
async def create(
    req: AssistantCreateRequest, user: User = Depends(current_user)
) -> Assistant:
    """
    Create a new assistant.
    """

    assistant = AssistantModel.create(
        id=uuid.uuid4().hex,
        user_id=user.id,
        description=req.description,
        instructions=req.instructions,
        name=req.name,
        model=GPTModel.GPT4,
    )

    return Assistant.from_model(assistant)
