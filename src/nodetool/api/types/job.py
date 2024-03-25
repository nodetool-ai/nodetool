from typing import Literal, Optional, List
from pydantic import BaseModel
from nodetool.models.job import Job
from pydantic import BaseModel, Field


class JobRequest(BaseModel):
    workflow_id: str
    params: dict


class JobUpdate(BaseModel):
    type: Literal["job_update"] = "job_update"
    status: str
    error: str | None = None


class JobList(BaseModel):
    next: Optional[str]
    jobs: List[Job]
