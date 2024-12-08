from pydantic import BaseModel, Field
from typing import Optional, List
from decimal import Decimal


class JobStatus(BaseModel):
    success: bool
    job_id: str
    ep_version: int


class ProgressData(BaseModel):
    progress_images: List[str] | None = None
    progress_message: Optional[str] = None


class Progress(BaseModel):
    start_time: float | None = None
    start_time_compute: float | None = None
    job_type: str | None = None
    auth_key: str | None = None
    progress: int
    progress_data: ProgressData | None = None
    estimate: Decimal | None = None
    queue_position: int | None = None
    num_workers_online: int | None = None


class JobResult(BaseModel):
    success: bool
    job_id: str | None = None
    ep_version: int | None = None
    job_state: str | None = None
    job_result: dict | None = None
    images: List[str] | None = None
    text: str | None = None
    prompt: str | None = None
    text_output: str | None = None
    audio_output: str | None = None
    seed: int | None = None
    model_name: str | None = None
    compute_duration: float | None = None
    total_duration: float
    auth: str | None = None
    worker_interface_version: str | None = None


class JobEvent(BaseModel):
    success: bool
    job_id: str
    ep_version: int
    job_state: str
    progress: Progress | None = None
    job_result: JobResult | None = None
