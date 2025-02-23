"""
Worker API Client for interacting with the Nodetool worker service.

This module provides a client interface for communicating with a Nodetool worker service
over HTTP. It handles API requests for model management and system monitoring, including:
- Querying installed HuggingFace models
- Retrieving recommended models for installation
- Fetching system statistics and resource usage

The client uses httpx for async HTTP communication and provides typed responses using
Pydantic models for data validation and serialization.
"""

import httpx

from nodetool.common.huggingface_models import CachedModel
from nodetool.common.system_stats import SystemStats
from nodetool.metadata.types import HuggingFaceModel


class WorkerAPIClient:
    base_url: str
    client: httpx.AsyncClient

    def __init__(self, base_url: str):
        self.base_url = base_url
        self.client = httpx.AsyncClient()

    def get_base_url(self):
        return self.base_url

    def _get_url(self, key: str):
        if key[0] == "/":
            key = key[1:]
        return f"{self.base_url}/{key}"

    async def get(self, path: str, **kwargs):
        return await self.client.get(
            self._get_url(path),
            **kwargs,
        )

    async def get_installed_models(self):
        response = await self.get("/huggingface_models")
        response.raise_for_status()
        return [CachedModel.model_validate(model) for model in response.json()]

    async def get_recommended_models(self):
        response = await self.get("/recommended_models")
        response.raise_for_status()
        return [HuggingFaceModel.model_validate(model) for model in response.json()]

    async def get_system_stats(self):
        response = await self.get("/system_stats")
        response.raise_for_status()
        return SystemStats.model_validate(response.json())
