from typing import AsyncGenerator

import httpx
from nodetool.api.types.prediction import Prediction as APIPrediction, PredictionResult
from nodetool.common.replicate_cost import calculate_cost, calculate_llm_cost
from nodetool.common.environment import Environment
from nodetool.common.replicate_node import (
    REPLICATE_MODELS,
    log,
)
from nodetool.models.prediction import Prediction


import asyncio
import re
from datetime import datetime

REPLICATE_STATUS_MAP = {
    "starting": "starting",
    "succeeded": "completed",
    "processing": "running",
    "failed": "failed",
    "canceled": "canceled",
}


async def get_model_status(owner: str, name: str) -> str:
    """
    Get the status of a model on Replicate
    """
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"https://replicate.com/{owner}/{name}/status")
            return response.json()["status"]
        except Exception as e:
            return "offline"


async def run_replicate(
    prediction: Prediction,
    params: dict,
) -> AsyncGenerator[APIPrediction | PredictionResult, None]:
    """
    Run the model on Replicate API
    """
    model = prediction.model
    model_info = REPLICATE_MODELS.get(model) or {}
    hardware = model_info.get("hardware", "")

    replicate = Environment.get_replicate_client()

    log.info(f"Running model {model}")
    started_at = datetime.now()

    # Split model_version into owner, name, version in format owner/name:version
    match = re.match(r"^(?P<owner>[^/]+)/(?P<name>[^:]+):(?P<version>.+)$", model)
    if not match:
        raise ValueError(f"Invalid model: {model}. Expected format: owner/name:version")
    version_id = match.group("version")
    replicate_pred = replicate.predictions.create(
        version=version_id,
        input=params,
    )

    model_status = await get_model_status(match.group("owner"), match.group("name"))

    print("model status: ", model_status)

    if model_status == "offline":
        current_status = "booting"
    else:
        current_status = "starting"

    for i in range(1800):
        replicate_pred = replicate.predictions.get(replicate_pred.id)

        if current_status == "booting" and replicate_pred.status == "starting":
            prediction.status = "booting"

        elif replicate_pred.status != current_status:
            current_status = replicate_pred.status
            prediction.status = REPLICATE_STATUS_MAP[replicate_pred.status]
            prediction.logs = replicate_pred.logs
            prediction.error = replicate_pred.error
            prediction.duration = (datetime.now() - started_at).total_seconds()
            prediction.save()

            log.info(f"Prediction status: {prediction.status}")

            yield APIPrediction.from_model(prediction)

        if replicate_pred.status in ("failed", "canceled"):
            raise ValueError(replicate_pred.error or "Prediction failed")

        if replicate_pred.status in ("succeeded", "failed", "canceled"):
            break

        await asyncio.sleep(1)

    assert replicate_pred.metrics, "Prediction metrics not found"

    if "input_token_count" in replicate_pred.metrics:
        input_token_count = replicate_pred.metrics["input_token_count"]
        output_token_count = replicate_pred.metrics["output_token_count"]
        prediction.cost = calculate_llm_cost(
            model, input_token_count, output_token_count
        )
        prediction.save()

    elif "predict_time" in replicate_pred.metrics:
        predict_time = replicate_pred.metrics["predict_time"]
        prediction.cost = calculate_cost(hardware, predict_time)
        prediction.save()
    else:
        raise ValueError("Cost calculation failed")

    yield PredictionResult.from_result(
        APIPrediction.from_model(prediction),
        replicate_pred.output,
    )
