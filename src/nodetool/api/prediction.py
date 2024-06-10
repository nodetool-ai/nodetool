#!/usr/bin/env python

import base64
from datetime import datetime
import json
from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import StreamingResponse
from nodetool.api.types.prediction import (
    PredictionCreateRequest,
    Prediction,
    PredictionList,
    PredictionResult,
)
from nodetool.api.utils import current_user, User
from nodetool.common.environment import Environment
from typing import AsyncGenerator, Optional
from nodetool.common.huggingface_prediction import run_huggingface
from nodetool.common.openai_nodes import run_openai
from nodetool.common.replicate_prediction import run_replicate
from nodetool.models.prediction import (
    Prediction as PredictionModel,
)
from nodetool.models.workflow import Workflow
from nodetool.nodes.anthropic.text import run_anthropic

log = Environment.get_logger()
router = APIRouter(prefix="/api/predictions", tags=["predictions"])


async def run_prediction(
    req: PredictionCreateRequest, user_id: str
) -> AsyncGenerator[PredictionResult | Prediction, None]:
    """
    Run the prediction for a given model.
    """
    prediction = PredictionModel.create(
        model=req.model,
        node_id=req.node_id,
        user_id=user_id,
        workflow_id=req.workflow_id,
        provider=req.provider,
        started_at=datetime.now(),
    )

    data_decoded = base64.b64decode(req.data) if isinstance(req.data, str) else None

    if req.provider == "huggingface":
        result = await run_huggingface(
            prediction=prediction,
            params=req.params,
            data=data_decoded,
        )
        yield PredictionResult.from_result(Prediction.from_model(prediction), result)
    elif req.provider == "replicate":
        async for msg in run_replicate(
            prediction=prediction,
            params=req.params,
        ):
            yield msg

    elif req.provider == "openai":
        result = await run_openai(
            prediction=prediction,
            params=req.params,
        )
        yield PredictionResult.from_result(Prediction.from_model(prediction), result)
    elif req.provider == "anthropic":
        result = await run_anthropic(
            prediction=prediction,
            params=req.params,
        )
        yield PredictionResult.from_result(Prediction.from_model(prediction), result)
    else:
        raise HTTPException(status_code=400, detail="Provider not supported")


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

    async def stream_lines():
        async for msg in run_prediction(req, user.id):
            yield (msg.model_dump_json() + "\n").encode("utf-8")

    return StreamingResponse(stream_lines(), media_type="application/x-ndjson")
