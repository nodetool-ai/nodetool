from nodetool.common.environment import Environment
from nodetool.models.prediction import Prediction
import httpx
import asyncio
from datetime import datetime
from typing import Any

log = Environment.get_logger()
API_URL = "https://api-inference.huggingface.co/models"
MAX_RETRY_COUNT = 10


async def run_huggingface(
    prediction: Prediction,
    params: dict,
    data: bytes | None = None,
) -> Any:
    model = prediction.model
    log.info(f"Running model {model} on Huggingface.")
    started_at = datetime.now()

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
                    response = await client.post(url, headers=headers, json=params)

                if response.status_code == 503:
                    result = response.json()
                    log.info(
                        f"Model {model} is booting. Waiting for {result['estimated_time']} seconds."
                    )
                    prediction.status = "booting"
                    prediction.save()

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

            prediction.duration = (datetime.now() - started_at).total_seconds()
            prediction.status = "completed"
            prediction.completed_at = datetime.now()
            prediction.save()

            return result

    except Exception as e:
        log.exception(e)
        prediction.status = "failed"
        prediction.error = str(e)
        prediction.completed_at = datetime.now()
        prediction.save()
        raise e
