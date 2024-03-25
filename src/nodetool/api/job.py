#!/usr/bin/env python

import asyncio
from datetime import datetime
import json
import threading
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from nodetool.api.utils import current_user, User

from nodetool.api.types.job import (
    JobList,
    JobUpdate,
)
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.common.environment import Environment

from nodetool.models.job import Job
from nodetool.models.workflow import Workflow
from nodetool.models.prediction import Prediction
from nodetool.api.types.prediction import Prediction as APIPrediction
from nodetool.workflows.types import Error, WorkflowUpdate


log = Environment.get_logger()
router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{id}")
async def get(id: str, user: User = Depends(current_user)) -> Job:
    """
    Returns the status of a job.
    """
    job = Job.find(user.id, id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    else:
        if job.user_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        else:
            return job


@router.get("/")
async def index(
    workflow_id: str | None = None,
    cursor: str | None = None,
    page_size: int | None = None,
    user: User = Depends(current_user),
) -> JobList:
    """
    Returns all assets for a given user or workflow.
    """
    if page_size is None:
        page_size = 10

    jobs, next_cursor = Job.paginate(
        user_id=user.id, workflow_id=workflow_id, limit=page_size, start_key=cursor
    )

    return JobList(next=next_cursor, jobs=jobs)


@router.put("/{id}")
async def update(id: str, req: JobUpdate, user: User = Depends(current_user)) -> Job:
    """
    Update a job.
    """
    job = Job.find(user.id, id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    else:
        if job.user_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        else:
            job.status = req.status
            job.error = req.error
            job.save()
            return job


@router.post("/")
async def run(
    req: RunJobRequest, execute: bool = True, user: User = Depends(current_user)
):
    from nodetool.workflows.workflow_runner import WorkflowRunner
    from nodetool.workflows.processing_context import (
        ProcessingContext,
    )

    if req.graph is None:
        workflow = Workflow.find(user.id, req.workflow_id)
        if workflow is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        else:
            req.graph = workflow.get_api_graph()

    assert req.graph is not None, "Graph is required"

    job = Job.create(
        job_type=req.job_type,
        workflow_id=req.workflow_id,
        user_id=user.id,
        graph=req.graph.model_dump(),
        status="running",
    )

    if execute is False:
        return job

    assert user.auth_token

    capabilities = ["db"]

    if Environment.get_comfy_folder():
        capabilities.append("comfy")

    context = ProcessingContext(
        user_id=user.id,
        auth_token=user.auth_token,
        workflow_id=req.workflow_id,
        capabilities=capabilities,
    )

    runner = WorkflowRunner()

    async def run():
        try:
            await runner.run(req, context)
        except Exception as e:
            log.exception(e)
            context.post_message(Error(error=str(e)))

    async def generate():
        yield json.dumps(JobUpdate(status="running").model_dump()) + "\n"

        thread = threading.Thread(target=lambda: asyncio.run(run()))
        thread.start()
        try:
            while runner.is_running():
                if context.has_messages():
                    msg = await context.pop_message_async()
                    if isinstance(msg, Prediction):
                        msg = APIPrediction.from_model(msg)
                    if isinstance(msg, WorkflowUpdate):
                        job.finished_at = datetime.now()
                        job.status = "completed"
                        job.cost = context.cost
                        job.save()
                    if isinstance(msg, Error):
                        raise Exception(msg.error)
                    yield msg.model_dump_json() + "\n"
                else:
                    await asyncio.sleep(0.1)

            while context.has_messages():
                msg = await context.pop_message_async()
                yield msg.model_dump_json() + "\n"

        except Exception as e:
            log.exception(e)
            job.finished_at = datetime.now()
            job.status = "failed"
            job.error = str(e)[:256]
            job.cost = context.cost
            job.save()
            yield json.dumps(
                JobUpdate(status="failed", error=str(e)).model_dump()
            ) + "\n"

    return StreamingResponse(generate(), media_type="application/x-ndjson")
