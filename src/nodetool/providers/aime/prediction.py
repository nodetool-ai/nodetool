from typing import Any, AsyncGenerator, Optional, Callable

import httpx
from nodetool.common.environment import Environment
from nodetool.types.prediction import Prediction, PredictionResult
import asyncio
from .types import JobEvent, JobStatus

log = Environment.get_logger()


async def fetch_auth_key(model: str, user: str, key: str) -> str:
    """Fetch authentication key from AIME API."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.aime.info/{model}/login",
            params={
                "user": user,
                "key": key,
                "version": "Python AIME API Client 0.8.2",
            },
        )

        if response.status_code != 200:
            raise ValueError(
                f"Authentication failed: {response.status_code} {response.text}"
            )

        data = response.json()
        if not data.get("success"):
            error_msg = data.get("error", "Unknown error")
            if ep_version := data.get("ep_version"):
                error_msg += f" Endpoint version: {ep_version}"
            raise ValueError(error_msg)

        return data["client_session_auth_key"]


async def run_aime(
    prediction: Prediction, env: dict[str, str]
) -> AsyncGenerator[PredictionResult, None]:
    params = prediction.params
    model = prediction.model
    payload = params.get("data", {})
    progress_callback = params.get("progress_callback", None)
    user = env.get("AIME_USER")
    api_key = env.get("AIME_API_KEY")

    assert user, "AIME_USER not set"
    assert api_key, "AIME_API_KEY not set"
    assert payload, "Payload is required"
    assert progress_callback, "Progress callback is required"
    assert model, "model is required"

    auth_key = await fetch_auth_key(model, user, api_key)

    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"https://api.aime.info/{model}",
            json={
                **payload,
                # "auth_key": auth_key,
                "wait_for_result": False,
                "client_session_auth_key": auth_key,
            },
            timeout=60.0,
        )

        if response.status_code != 200:
            raise ValueError(
                f"Failed to create job: {response.status_code} {response.text}"
            )

        # Parse initial response as JobEvent
        job_status = JobStatus.model_validate(response.json())
        job_id = job_status.job_id

        # Poll progress every second
        while True:
            progress_response = await client.get(
                f"https://api.aime.info/{model}/progress",
                params={"client_session_auth_key": auth_key, "job_id": job_id},
                timeout=10.0,
            )

            if progress_response.status_code != 200:
                raise ValueError(
                    f"Failed to get progress: {progress_response.status_code} {progress_response.text}"
                )

            # Parse progress response as JobEvent
            job_event = JobEvent.model_validate(progress_response.json())

            # Call the progress callback with the latest data
            if progress_callback and job_event.progress:
                progress_callback(job_event.progress)

            # Check if job is complete
            if job_event.job_state == "done" and job_event.job_result:
                yield PredictionResult(
                    prediction=prediction,
                    content=job_event.job_result.model_dump(),
                    encoding="json",
                )
                break
            elif job_event.job_state == "failed":
                raise ValueError(
                    f"Job failed: {job_event.job_result if job_event.job_result else 'Unknown error'}"
                )

            # Wait 1 second before next poll
            await asyncio.sleep(1)
