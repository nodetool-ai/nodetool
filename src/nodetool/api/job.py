#!/usr/bin/env python

import asyncio
from datetime import datetime
import threading
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from nodetool.api.utils import current_user, User

from nodetool.api.types.job import (
    Job,
    JobList,
    JobUpdate,
)
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.common.environment import Environment

from nodetool.models.job import Job as JobModel
from nodetool.models.workflow import Workflow
from nodetool.models.prediction import Prediction
from nodetool.api.types.prediction import Prediction as APIPrediction
from nodetool.workflows.types import Error


log = Environment.get_logger()
router = APIRouter(prefix="/api/jobs", tags=["jobs"])


@router.get("/{id}")
async def get(id: str, user: User = Depends(current_user)) -> Job:
    """
    Returns the status of a job.
    """
    job = JobModel.find(user.id, id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    else:
        if job.user_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        else:
            return Job.from_model(job)


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

    jobs, next_cursor = JobModel.paginate(
        user_id=user.id, workflow_id=workflow_id, limit=page_size, start_key=cursor
    )

    return JobList(next=next_cursor, jobs=[Job.from_model(job) for job in jobs])


@router.put("/{id}")
async def update(id: str, req: JobUpdate, user: User = Depends(current_user)) -> Job:
    """
    Update a job.
    """
    job = JobModel.find(user.id, id)
    if job is None:
        raise HTTPException(status_code=404, detail="Job not found")
    else:
        if job.user_id != user.id:
            raise HTTPException(status_code=403, detail="Forbidden")
        else:
            job.status = req.status
            job.error = req.error
            job.save()
            return Job.from_model(job)


@router.post("/")
async def run(
    request: Request,
    job_request: RunJobRequest,
    execute: bool = True,
    user: User = Depends(current_user),
):
    from nodetool.workflows.workflow_runner import WorkflowRunner
    from nodetool.workflows.processing_context import (
        ProcessingContext,
    )

    if job_request.graph is None:
        workflow = Workflow.find(user.id, job_request.workflow_id)
        if workflow is None:
            raise HTTPException(status_code=404, detail="Workflow not found")
        else:
            job_request.graph = workflow.get_api_graph()

    assert job_request.graph is not None, "Graph is required"

    job = JobModel.create(
        job_type=job_request.job_type,
        workflow_id=job_request.workflow_id,
        user_id=user.id,
        graph=job_request.graph.model_dump(),
        status="running",
    )
    assert job

    def job_update_message(job: JobModel):
        return JobUpdate.from_model(job).model_dump_json() + "\n"

    if execute is False:
        return job

    assert user.auth_token

    context = ProcessingContext(
        user_id=user.id,
        auth_token=user.auth_token,
        workflow_id=job_request.workflow_id,
    )

    runner = WorkflowRunner(job.id)

    async def run():
        try:
            await runner.run(job_request, context)
        except Exception as e:
            log.exception(e)
            context.post_message(Error(error=str(e)))

    async def generate(job_id: str):
        job = JobModel.get(job_id)
        assert job, "Job not found"

        yield job_update_message(job)

        thread = threading.Thread(target=lambda: asyncio.run(run()))
        thread.start()

        try:
            while runner.is_running():
                # read job status from database
                job = JobModel.get(job_id)
                assert job, "Job not found"

                if job.status == "cancelled":
                    runner.cancel()
                    context.is_cancelled = True

                if context.has_messages():
                    msg = await context.pop_message_async()
                    if isinstance(msg, Prediction):
                        msg = APIPrediction.from_model(msg)
                        job.reload()
                    if isinstance(msg, JobUpdate):
                        job.finished_at = datetime.now()
                        job.status = msg.status
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
            job = JobModel.get(job_id)
            assert job
            job.finished_at = datetime.now()
            job.status = "failed"
            job.error = str(e)[:256]
            job.cost = context.cost
            job.save()
            yield job_update_message(job)

    return StreamingResponse(generate(job.id), media_type="application/x-ndjson")
