from datetime import datetime
import uuid

from nodetool.models.base_model import DBModel, DBField, create_time_ordered_uuid
from typing import Any

from nodetool.models.condition_builder import Field


class Prediction(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "nodetool_predictions",
        }

    id: str = DBField(hash_key=True)
    user_id: str = DBField()
    node_id: str = DBField(default="")
    provider: str = DBField(default="")
    model: str = DBField()
    workflow_id: str | None = DBField(default=None)
    error: str | None = DBField(default=None)
    logs: str | None = DBField(default=None)
    status: str = DBField(default="starting")
    created_at: datetime | None = DBField(default_factory=datetime.now)
    started_at: datetime | None = DBField(default=None)
    completed_at: datetime | None = DBField(default=None)
    cost: float | None = DBField(default=None)
    duration: float | None = DBField(default=None)
    hardware: str | None = DBField(default=None)

    @classmethod
    def create(
        cls,
        user_id: str,
        node_id: str,
        provider: str,
        model: str,
        workflow_id: str | None = None,
        status: str = "starting",
        cost: float | None = None,
        hardware: str | None = None,
        started_at: datetime | None = None,
    ):
        prediction = cls(
            id=create_time_ordered_uuid(),
            user_id=user_id,
            node_id=node_id,
            provider=provider,
            model=model,
            workflow_id=workflow_id,
            status=status,
            cost=cost,
            hardware=hardware,
            started_at=started_at,
        )
        prediction.save()
        return prediction

    @classmethod
    def find(cls, user_id: str, id: str):
        prediction = cls.get(id)
        if prediction is None or prediction.user_id != user_id:
            return None
        return prediction

    @classmethod
    def paginate(
        cls,
        user_id: str,
        workflow_id: str | None = None,
        limit: int = 100,
        start_key: str | None = None,
    ):
        if workflow_id is None:
            return cls.query(
                condition=Field("user_id")
                .equals(user_id)
                .and_(Field("id").greater_than(start_key or "")),
                limit=limit,
            )
        else:
            return cls.query(
                condition=Field("user_id")
                .equals(user_id)
                .and_(Field("workflow_id").equals(workflow_id))
                .and_(Field("id").greater_than(start_key or "")),
                limit=limit,
            )
