#!/usr/bin/env python

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from nodetool.api.utils import current_user, User
from nodetool.types.chat import (
    TaskCreateRequest,
    TaskUpdateRequest,
    TaskList,
    Task,
)
from nodetool.common.environment import Environment
from nodetool.models.task import Task as TaskModel
from typing import Optional

log = Environment.get_logger()
router = APIRouter(prefix="/api/tasks", tags=["tasks"])


@router.get("/")
async def index(
    thread_id: str,
    user: User = Depends(current_user),
    cursor: Optional[str] = None,
    page_size: Optional[int] = None,
) -> TaskList:
    """
    Returns all tasks for the current user, optionally filtered by status.
    """
    if page_size is None:
        page_size = 100

    tasks, next_cursor = TaskModel.paginate(
        thread_id=thread_id, limit=page_size, start_key=cursor
    )

    # validate the tasks are from the current user
    tasks = [task for task in tasks if task.user_id == user.id]

    return TaskList(next=next_cursor, tasks=[Task.from_model(task) for task in tasks])


@router.get("/{id}")
async def get(id: str, user: User = Depends(current_user)) -> Task:
    """
    Returns the task with the given id.
    """
    task = TaskModel.find(user.id, id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return Task.from_model(task)


@router.post("/")
async def create(req: TaskCreateRequest, user: User = Depends(current_user)) -> Task:
    """
    Creates a new task.
    """
    task = TaskModel.create(
        user_id=user.id,
        thread_id=req.thread_id,
        task_type=req.task_type,
        name=req.name,
        instructions=req.instructions,
        dependencies=req.dependencies,
        started_at=datetime.now(),
    )
    return Task.from_model(task)


@router.put("/{id}")
async def update(
    id: str, req: TaskUpdateRequest, user: User = Depends(current_user)
) -> Task:
    """
    Updates the task with the given id.
    """
    task = TaskModel.find(user.id, id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")

    if req.status:
        task.status = req.status
    if req.error:
        task.error = req.error
    if req.result:
        task.result = req.result
    if req.cost:
        task.cost = req.cost

    task.save()
    return Task.from_model(task)


@router.delete("/{id}")
async def delete(id: str, user: User = Depends(current_user)):
    """
    Deletes the task with the given id.
    """
    task = TaskModel.find(user.id, id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    task.delete()
