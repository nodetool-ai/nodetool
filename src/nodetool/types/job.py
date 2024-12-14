from typing import Literal, Optional, List
from pydantic import BaseModel
from nodetool.models.job import Job as JobModel
from pydantic import BaseModel, Field


class JobCancelledException(Exception):
    pass


class Job(BaseModel):
    id: str
    job_type: str
    status: str
    workflow_id: str
    started_at: str
    finished_at: str | None
    error: str | None
    cost: float | None

    @classmethod
    def from_model(cls, job: JobModel):
        return cls(
            id=job.id,
            job_type=job.job_type,
            status=job.status,
            workflow_id=job.workflow_id,
            started_at=job.started_at.isoformat(),
            finished_at=job.finished_at.isoformat() if job.finished_at else None,
            error=job.error,
            cost=job.cost,
        )


class JobRequest(BaseModel):
    workflow_id: str
    params: dict


class JobUpdate(BaseModel):
    type: Literal["job_update"] = "job_update"
    status: str
    job_id: str | None = None
    message: str | None = None
    result: dict | None = None
    error: str | None = None

    @classmethod
    def from_model(cls, job: JobModel):
        return cls(
            job_id=job.id,
            status=job.status,
            error=job.error,
        )


class JobList(BaseModel):
    next: Optional[str]
    jobs: List[Job]
