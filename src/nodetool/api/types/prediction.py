from nodetool.models.prediction import Prediction as PredictionModel
from pydantic import BaseModel
from typing import Any, List, Literal


class Prediction(BaseModel):
    """
    A prediction made by a remote model.
    """

    type: Literal["prediction"] = "prediction"

    id: str
    user_id: str
    node_id: str
    workflow_id: str | None = None
    provider: str | None = None
    model: str | None = None
    version: str | None = None
    node_type: str | None = None
    status: str
    logs: str | None = None
    error: str | None = None
    duration: float | None = None
    created_at: str | None = None
    started_at: str | None = None
    completed_at: str | None = None

    @classmethod
    def from_model(cls, prediction: PredictionModel):
        return cls(
            id=prediction.id,
            user_id=prediction.user_id,
            node_id=prediction.node_id,
            workflow_id=prediction.workflow_id,
            node_type=prediction.node_type,
            provider=prediction.provider,
            model=prediction.model,
            version=prediction.version,
            status=prediction.status,
            logs=prediction.logs,
            error=prediction.error,
            duration=prediction.duration,
            created_at=(
                prediction.created_at.isoformat() if prediction.created_at else None
            ),
            started_at=(
                prediction.started_at.isoformat() if prediction.started_at else None
            ),
            completed_at=(
                prediction.completed_at.isoformat() if prediction.completed_at else None
            ),
        )


class PredictionList(BaseModel):
    next: str | None
    predictions: List[Prediction]


class PredictionUpdateRequest(BaseModel):
    """
    The request body for updating a prediction.
    """

    status: str | None = None
    error: str | None = None
    logs: str | None = None
    metrics: dict[str, Any] | None = None
    completed_at: str | None = None


class PredictionCreateRequest(BaseModel):
    """
    The request body for creating a prediction.
    """

    node_id: str
    node_type: str
    provider: str
    model: str
    cost: float | None = None
    version: str | None = None
    workflow_id: str | None = None
    status: str | None = None
