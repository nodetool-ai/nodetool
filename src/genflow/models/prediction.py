from datetime import datetime
from genflow.models.base_model import DBModel, DBField
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
    version: str = DBField()
    workflow_id: str | None = DBField(default=None)
    input: dict[str, Any] = DBField()
    output: Any | None = DBField(default=None)
    error: str | None = DBField(default=None)
    logs: str | None = DBField(default=None)
    status: str = DBField(default="starting")
    created_at: datetime | None = DBField()
    started_at: datetime | None = DBField()
    completed_at: datetime | None = DBField()
    metrics: dict = DBField(default={})

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
        workflow_id: str,
        limit: int = 100,
        start_key: str | None = None,
    ):
        return cls.query(
            condition="user_id = :user_id AND workflow_id = :workflow_id",
            values={":user_id": user_id, ":workflow_id": workflow_id},
            index="genflow_prediction_user_index",
            limit=limit,
            start_key=start_key,
        )
