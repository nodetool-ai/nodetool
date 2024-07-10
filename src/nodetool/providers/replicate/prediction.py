from typing import AsyncGenerator

import httpx
from nodetool.types.prediction import Prediction, PredictionResult
from nodetool.providers.replicate.cost_calculation import (
    calculate_cost,
    calculate_llm_cost,
)
from nodetool.common.environment import Environment
from nodetool.providers.replicate.replicate_node import (
    REPLICATE_MODELS,
    log,
)
import asyncio
import re
from datetime import datetime

"""
This module provides functionality for generating Python code for Replicate nodes based on OpenAPI specifications.

It includes functions for:
- Retrieving API specifications from the Replicate API
- Converting OpenAPI schemas to Pydantic models
- Generating source code for Replicate nodes
- Creating enum classes from OpenAPI schemas
- Formatting generated code using Black

The main functions in this module are:
- get_model_api: Retrieves API specifications for a Replicate model
- generate_model_source_code: Generates source code for a Pydantic model from an OpenAPI schema
- create_replicate_node: Creates a Replicate node class from a model ID and version
- create_replicate_namespace: Creates a namespace file containing multiple Replicate nodes

This module is used to automate the process of creating Python classes that represent Replicate models,
making it easier to interact with these models in a type-safe manner within the nodetool framework.
"""

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
) -> AsyncGenerator[Prediction | PredictionResult, None]:
    """
    Run the model on Replicate API
    """
    model = prediction.model
    params = prediction.params
    assert model, "Model not found"

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

        yield prediction

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
        yield prediction

    elif "predict_time" in replicate_pred.metrics:
        predict_time = replicate_pred.metrics["predict_time"]
        prediction.cost = calculate_cost(hardware, predict_time)
        yield prediction
    else:
        raise ValueError("Cost calculation failed")

    yield PredictionResult.from_result(
        prediction,
        replicate_pred.output,
    )
