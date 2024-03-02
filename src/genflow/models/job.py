from typing import Optional, Any
from datetime import datetime
import uuid
from pydantic import BaseModel
from genflow.models.base_model import DBModel, DBField


class Job(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "genflow_jobs",
            "key_schema": {"id": "HASH"},
            "attribute_definitions": {"id": "S", "user_id": "S", "workflow_id": "S"},
            "global_secondary_indexes": {
                "genflow_job_user_index": {"user_id": "HASH"},
                "genflow_job_workflow_index": {"workflow_id": "HASH"},
            },
        }

    id: str = DBField(hash_key=True)
    user_id: str = DBField(default="")
    job_type: str = DBField(default="")
    status: str = DBField(default="starting")
    workflow_id: str = DBField(default="")
    started_at: datetime = DBField(default_factory=datetime.now)
    finished_at: datetime | None = DBField(default=None)
    output: dict | None = DBField(default_factory=dict)
    params: dict | None = DBField(default_factory=dict)
    graph: dict = DBField(default_factory=dict)
    error: str | None = DBField(default=None)

    @classmethod
    def find(cls, user_id: str, job_id: str):
        job = cls.get(job_id)
        return job if job and job.user_id == user_id else None

    @classmethod
    def create(cls, workflow_id: str, user_id: str, **kwargs):
        return super().create(
            id=str(uuid.uuid4()), workflow_id=workflow_id, user_id=user_id, **kwargs
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
                condition="workflow_id = :workflow_id",
                values={":workflow_id": workflow_id},
                index="genflow_job_workflow_index",
                limit=limit,
                start_key=start_key,
            )
        elif user_id:
            return cls.query(
                condition="user_id = :user_id",
                values={":user_id": user_id},
                index="genflow_job_user_index",
                limit=limit,
                start_key=start_key,
            )
        else:
            raise ValueError("Must provide either user_id or workflow_id")
