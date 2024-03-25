from datetime import datetime
import uuid

from nodetool.models.base_model import DBModel, DBField, create_time_ordered_uuid
from typing import Any


class Prediction(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "nodetool_predictions",
            "key_schema": {"id": "HASH"},
            "attribute_definitions": {"id": "S", "user_id": "S", "workflow_id": "S"},
            "global_secondary_indexes": {
                "nodetool_prediction_user_index": {
                    "user_id": "HASH",
                    "workflow_id": "RANGE",
                },
            },
        }

    id: str = DBField(hash_key=True)
    user_id: str = DBField()
    node_id: str = DBField()
    node_type: str = DBField()
    provider: str = DBField(default="")
    model: str = DBField()
    version: str = DBField(default="")
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
        node_type: str,
        provider: str,
        model: str,
        version: str | None = None,
        workflow_id: str | None = None,
        status: str = "starting",
        cost: float | None = None,
        hardware: str | None = None,
    ):
        prediction = cls(
            id=create_time_ordered_uuid(),
            user_id=user_id,
            node_id=node_id,
            node_type=node_type,
            provider=provider,
            model=model,
            version=version if version else "",
            workflow_id=workflow_id,
            status=status,
            cost=cost,
            hardware=hardware,
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
                condition="user_id = :user_id",
                values={":user_id": user_id},
                index="nodetool_prediction_user_index",
                limit=limit,
                start_key=start_key,
            )
        else:
            return cls.query(
                condition="user_id = :user_id AND workflow_id = :workflow_id",
                values={":user_id": user_id, ":workflow_id": workflow_id},
                index="nodetool_prediction_user_index",
                limit=limit,
                start_key=start_key,
            )
