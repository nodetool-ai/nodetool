#!/usr/bin/env python

import base64
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from nodetool.api.utils import current_user, User

from nodetool.metadata.types import AssetRef
from nodetool.types.job import (
    Job,
    JobList,
    JobUpdate,
)
from nodetool.workflows.http_stream_runner import HTTPStreamRunner
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.common.environment import Environment

from nodetool.models.job import Job as JobModel
from nodetool.models.workflow import Workflow
from nodetool.models.prediction import Prediction
from nodetool.types.prediction import Prediction as APIPrediction
from nodetool.workflows.run_workflow import run_workflow
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
async def create(
    job_request: RunJobRequest,
    user: User = Depends(current_user),
):
    from nodetool.workflows.workflow_runner import WorkflowRunner

    job = JobModel.create(
        job_type=job_request.job_type,
        workflow_id=job_request.workflow_id,
        user_id=user.id,
        graph=job_request.graph.model_dump() if job_request.graph else None,
        status="running",
    )

    return job


@router.post("/run")
async def run(
    job_request: RunJobRequest,
    request: Request,
    stream: bool = False,
    user: User = Depends(current_user),
):
    server_protocol = request.headers.get("x-forwarded-proto", "http")
    server_host_name = request.headers.get("host", "localhost")
    server_port = request.headers.get("x-server-port", "8000")

    if job_request.api_url == "" or job_request.api_url is None:
        job_request.api_url = f"{server_protocol}://{server_host_name}:{server_port}"

    if job_request.auth_token == "":
        job_request.auth_token = user.auth_token or ""

    if stream:
        runner = HTTPStreamRunner()
        return StreamingResponse(
            runner.run_job(job_request), media_type="application/x-ndjson"
        )
    else:
        result = {}
        async for msg in run_workflow(job_request):
            if msg.type == "job_update":
                if msg.status == "completed":
                    result = msg.result
                    for key, value in result.items():
                        if isinstance(value, AssetRef) and value.data:
                            if isinstance(value.data, bytes):
                                value.uri = f"data:application/octet-stream;base64,{base64.b64encode(value.data).decode('utf-8')}"
                            elif isinstance(value.data, list):
                                # TODO: handle multiple assets
                                value.uri = f"data:application/octet-stream;base64,{base64.b64encode(value.data[0]).decode('utf-8')}"
                            value.data = None
                elif msg.status == "failed":
                    raise HTTPException(status_code=500, detail=msg.error)
        return result
