from typing import Optional
from datetime import datetime
from nodetool.models.base_model import DBModel, DBField, create_time_ordered_uuid
from nodetool.models.condition_builder import Field


class Job(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {"table_name": "nodetool_jobs"}

    id: str = DBField()
    user_id: str = DBField(default="")
    job_type: str = DBField(default="")
    status: str = DBField(default="starting")
    workflow_id: str = DBField(default="")
    started_at: datetime = DBField(default_factory=datetime.now)
    finished_at: datetime | None = DBField(default=None)
    graph: dict = DBField(default_factory=dict)
    error: str | None = DBField(default=None)
    cost: float | None = DBField(default=None)

    @classmethod
    def find(cls, user_id: str, job_id: str):
        job = cls.get(job_id)
        return job if job and job.user_id == user_id else None

    @classmethod
    def create(cls, workflow_id: str, user_id: str, **kwargs):
        return super().create(
            id=create_time_ordered_uuid(),
            workflow_id=workflow_id,
            user_id=user_id,
            **kwargs
        )

    @classmethod
    def paginate(
        cls,
        user_id: str,
        workflow_id: Optional[str] = None,
        limit: int = 10,
        start_key: Optional[str] = None,
    ):
        if workflow_id:
            return cls.query(
                Field("workflow_id")
                .equals(workflow_id)
                .and_(Field("id").greater_than(start_key or "")),
                limit=limit,
            )
        elif user_id:
            return cls.query(
                Field("user_id")
                .equals(user_id)
                .and_(Field("id").greater_than(start_key or "")),
                limit=limit,
            )
        else:
            raise ValueError("Must provide either user_id or workflow_id")
