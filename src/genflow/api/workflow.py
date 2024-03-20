#!/usr/bin/env python

from datetime import datetime
import time
from fastapi import APIRouter, Depends, HTTPException, Body
from genflow.api.types.workflow import WorkflowList, Workflow, WorkflowRequest
from genflow.api.utils import current_user, User
from genflow.common.environment import Environment
from typing import Optional
from genflow.workflows.examples import get_examples
from genflow.workflows.read_graph import read_graph
from genflow.models.workflow import Workflow as WorkflowModel


log = Environment.get_logger()
router = APIRouter(prefix="/api/workflows", tags=["workflows"])


@router.post("/")
async def create(
    workflow_request: WorkflowRequest, user: User = Depends(current_user)
) -> Workflow:
    if workflow_request.graph:
        return Workflow.from_model(
            WorkflowModel.create(
                name=workflow_request.name,
                description=workflow_request.description,
                thumbnail=workflow_request.thumbnail,
                access=workflow_request.access,
                graph=workflow_request.graph.model_dump(),
                user_id=user.id,
            )
        )
    elif workflow_request.comfy_workflow:
        edges, nodes = read_graph(workflow_request.comfy_workflow)
        return Workflow.from_model(
            WorkflowModel.create(
                name=workflow_request.name,
                description=workflow_request.description,
                thumbnail=workflow_request.thumbnail,
                access=workflow_request.access,
                user_id=user.id,
                graph={
                    "nodes": nodes,
                    "edges": edges,
                },
            )
        )
    else:
        raise HTTPException(status_code=400, detail="Invalid workflow")


@router.get("/")
async def index(
    user: User = Depends(current_user),
    cursor: Optional[str] = None,
    limit: int = 100,
) -> WorkflowList:
    workflows, cursor = WorkflowModel.paginate(
        user_id=user.id, limit=limit, start_key=cursor
    )
    workflows = [Workflow.from_model(workflow) for workflow in workflows]
    return WorkflowList(workflows=workflows, next=cursor)


@router.get("/public")
async def public(limit: int = 100, cursor: Optional[str] = None) -> WorkflowList:
    workflows, cursor = WorkflowModel.paginate(limit=limit, start_key=cursor)
    workflows = [Workflow.from_model(workflow) for workflow in workflows]
    return WorkflowList(workflows=workflows, next=cursor)


@router.get("/user/{user_id}")
async def user_workflows(
    user_id: str, limit: int = 100, cursor: Optional[str] = None
) -> WorkflowList:
    workflows, cursor = WorkflowModel.paginate(
        user_id=user_id, limit=limit, start_key=cursor
    )
    workflows = [Workflow.from_model(workflow) for workflow in workflows]
    return WorkflowList(workflows=workflows, next=cursor)


@router.get("/examples")
async def examples() -> WorkflowList:
    return WorkflowList(workflows=get_examples(), next=None)


@router.get("/{id}")
async def get_workflow(id: str, user: User = Depends(current_user)) -> Workflow:
    workflow = WorkflowModel.get(id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if workflow.access != "public" and workflow.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return Workflow.from_model(workflow)


@router.put("/{id}")
async def update_workflow(
    id: str,
    workflow_request: WorkflowRequest,
    user: User = Depends(current_user),
) -> Workflow:
    workflow = WorkflowModel.get(id)
    if not workflow:
        workflow = WorkflowModel(id=id, user_id=user.id)
    if workflow.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if workflow_request.graph is None:
        raise HTTPException(status_code=400, detail="Invalid workflow")
    workflow.name = workflow_request.name
    workflow.description = workflow_request.description
    workflow.thumbnail = workflow_request.thumbnail
    workflow.access = workflow_request.access
    workflow.graph = workflow_request.graph.model_dump()
    workflow.updated_at = datetime.now()
    workflow.save()
    return Workflow.from_model(workflow)


# Endpoint to delete a specific workflow by ID
@router.delete("/{id}")
async def delete_workflow(id: str, user: User = Depends(current_user)) -> None:
    workflow = WorkflowModel.get(id)
    if not workflow:
        raise HTTPException(status_code=404, detail="Workflow not found")
    if workflow.user_id != user.id:
        raise HTTPException(status_code=404, detail="Workflow not found")
    workflow.delete()
