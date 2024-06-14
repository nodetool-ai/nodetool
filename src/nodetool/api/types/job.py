from typing import Literal, Optional, List
from pydantic import BaseModel
from nodetool.models.job import Job
from pydantic import BaseModel, Field


class JobRequest(BaseModel):
    workflow_id: str
    params: dict


class JobUpdate(BaseModel):
    type: Literal["job_update"] = "job_update"
    job_id: str
    status: str
    error: str | None = None

    @classmethod
    def from_model(cls, job: Job):
        return cls(
            job_id=job.id,
            status=job.status,
            error=job.error,
        )


class JobList(BaseModel):
    next: Optional[str]
    jobs: List[Job]
