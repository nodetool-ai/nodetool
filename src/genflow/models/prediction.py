from datetime import datetime
import uuid

from pydantic import BaseModel
from genflow.models.base_model import DBModel, DBField, create_time_ordered_uuid
from typing import Any


class Prediction(DBModel):
    @classmethod
    def get_table_schema(cls):
        return {
            "table_name": "genflow_predictions",
            "key_schema": {"id": "HASH"},
            "attribute_definitions": {"id": "S", "user_id": "S", "workflow_id": "S"},
            "global_secondary_indexes": {
                "genflow_prediction_user_index": {
                    "user_id": "HASH",
                    "workflow_id": "RANGE",
                },
            },
        }

    id: str = DBField(hash_key=True)
    user_id: str = DBField()
    node_id: str = DBField()
    node_type: str = DBField()
    model: str = DBField()
    version: str = DBField(default="")
    workflow_id: str | None = DBField(default=None)
    input: dict[str, Any] = DBField(default_factory=dict)
    error: str | None = DBField(default=None)
    logs: str | None = DBField(default=None)
    status: str = DBField(default="starting")
    created_at: datetime | None = DBField(default_factory=datetime.now)
    started_at: datetime | None = DBField(default=None)
    completed_at: datetime | None = DBField(default=None)
    metrics: dict = DBField(default_factory=dict)

    @classmethod
    def create(
        cls,
        user_id: str,
        node_id: str,
        node_type: str,
        model: str,
        version: str | None = None,
        workflow_id: str | None = None,
        status: str = "starting",
        input: dict[str, Any] = {},
    ):
        prediction = cls(
            id=create_time_ordered_uuid(),
            user_id=user_id,
            node_id=node_id,
            node_type=node_type,
            model=model,
            version=version if version else "",
            workflow_id=workflow_id,
            status=status,
            input=input,
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
                index="genflow_prediction_user_index",
                limit=limit,
                start_key=start_key,
            )
        else:
            return cls.query(
                condition="user_id = :user_id AND workflow_id = :workflow_id",
                values={":user_id": user_id, ":workflow_id": workflow_id},
                index="genflow_prediction_user_index",
                limit=limit,
                start_key=start_key,
            )


class PredictionCreateRequest(BaseModel):
    """
    The request body for creating a prediction.
    """

    node_id: str
    node_type: str
    model: str
    version: str | None = None
    workflow_id: str | None = None
    status: str | None = None
