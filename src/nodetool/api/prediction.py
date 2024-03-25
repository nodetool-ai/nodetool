#!/usr/bin/env python

from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from nodetool.api.types.prediction import (
    PredictionCreateRequest,
    PredictionUpdateRequest,
    Prediction,
    PredictionList,
)
from nodetool.api.utils import current_user, User
from nodetool.common.environment import Environment
from typing import Optional
from nodetool.models.prediction import (
    Prediction as PredictionModel,
)
from nodetool.models.workflow import Workflow

log = Environment.get_logger()
router = APIRouter(prefix="/api/predictions", tags=["predictions"])


@router.get("/")
async def index(
    cursor: Optional[str] = None,
    page_size: Optional[int] = None,
    user: User = Depends(current_user),
) -> PredictionList:
    """
    Returns all assets for a given user or workflow.
    """
    if page_size is None:
        page_size = 100

    predictions, next_cursor = PredictionModel.paginate(
        user_id=user.id,
        limit=page_size,
        start_key=cursor,
    )

    predictions = [Prediction.from_model(p) for p in predictions]

    return PredictionList(next=next_cursor, predictions=predictions)


@router.get("/{id}")
async def get(id: str, user: User = Depends(current_user)) -> Prediction:
    pred = PredictionModel.find(user.id, id)
    if pred is None:
        raise HTTPException(status_code=404, detail="Prediction not found")
    return Prediction.from_model(pred)


@router.put("/{id}")
async def update(
    id: str,
    req: PredictionUpdateRequest,
    user: User = Depends(current_user),
) -> Prediction:
    """
    Updates the asset for the given id.
    """
    pred = PredictionModel.find(user.id, id)
    if pred is None:
        raise HTTPException(status_code=404, detail="Prediction not found")
    if req.status:
        pred.status = req.status
    if req.error:
        pred.error = req.error
    if req.logs:
        pred.logs = req.logs
    if req.metrics:
        pred.metrics = req.metrics
    if req.completed_at:
        pred.completed_at = datetime.fromisoformat(req.completed_at)
    return Prediction.from_model(pred)


@router.post("/")
async def create(
    req: PredictionCreateRequest, user: User = Depends(current_user)
) -> Prediction:
    """
    Create a new asset.
    """
    pred = PredictionModel.create(
        user_id=user.id,
        node_id=req.node_id,
        node_type=req.node_type,
        provider=req.provider,
        model=req.model,
        workflow_id=req.workflow_id if req.workflow_id else "",
        status=req.status if req.status else "",
    )
    return Prediction.from_model(pred)
