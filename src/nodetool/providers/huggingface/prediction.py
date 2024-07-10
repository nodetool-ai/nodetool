import base64
from nodetool.common.environment import Environment
import httpx
import asyncio
from datetime import datetime
from typing import Any

from nodetool.types.prediction import Prediction, PredictionResult

"""
This module provides functionality to run predictions using Hugging Face's inference API.

It contains an asynchronous function `run_huggingface` that sends requests to the Hugging Face
API to run machine learning models. The module handles model loading, retrying on temporary
failures, and updating the prediction status.

Functions:
    run_huggingface(prediction: Prediction, params: dict, data: bytes | None = None) -> Any:
        Runs a prediction using a specified Hugging Face model.

Constants:
    API_URL: The base URL for the Hugging Face inference API.
    MAX_RETRY_COUNT: The maximum number of retry attempts for booting models.

The module uses environment variables for configuration and logging, and it updates
the prediction status in a database or storage system.

Note:
    This module requires a valid Hugging Face API token to be set in the environment.
"""

log = Environment.get_logger()
API_URL = "https://api-inference.huggingface.co/models"
MAX_RETRY_COUNT = 10


async def run_huggingface(
    prediction: Prediction,
):
    data = (
        base64.b64decode(prediction.data) if isinstance(prediction.data, str) else None
    )
    model = prediction.model
    log.info(f"Running model {model} on Huggingface.")

    url = f"{API_URL}/{model}"
    headers = {
        "Authorization": f"Bearer {Environment.get_huggingface_token()}",
    }

    try:
        async with httpx.AsyncClient(timeout=600) as client:
            retry_count = 0
            while True:
                if data:
                    response = await client.post(url, headers=headers, content=data)
                else:
                    response = await client.post(
                        url, headers=headers, json=prediction.params
                    )

                if response.status_code == 503:
                    result = response.json()
                    log.info(
                        f"Model {model} is booting. Waiting {result['estimated_time']} seconds."
                    )
                    prediction.status = "booting"

                    await asyncio.sleep(result["estimated_time"] / 2)
                    retry_count += 1
                    if retry_count > MAX_RETRY_COUNT:
                        raise Exception(
                            f"Failed to run model {model}. Status: {result['error']}."
                        )
                elif response.status_code != 200:
                    raise Exception(
                        f"Failed to run model {model}. Status code: {response.status_code}. Response: {response.text}"
                    )
                else:
                    if response.headers.get("content-type") == "application/json":
                        result = response.json()
                    else:
                        result = response.content
                    break

        prediction.status = "completed"
        yield PredictionResult(prediction=prediction, content=result, encoding="json")

    except Exception as e:
        log.exception(e)
        raise e
