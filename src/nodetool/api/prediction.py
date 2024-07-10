#!/usr/bin/env python

import base64
from datetime import datetime
import json
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from nodetool.types.prediction import (
    PredictionCreateRequest,
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


@router.post("/")
async def create(req: PredictionCreateRequest, user: User = Depends(current_user)):
    prediction = PredictionModel.create(
        model=req.model,
        node_id=req.node_id,
        user_id=user.id,
        workflow_id=req.workflow_id,
        provider=req.provider.value,
        started_at=datetime.now(),
    )
    return Prediction.from_model(prediction)
