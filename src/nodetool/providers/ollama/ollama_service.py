import json
import os
from typing import AsyncGenerator
from nodetool.common.environment import Environment
from nodetool.metadata.types import LlamaModel
from ollama import AsyncClient

# Simple module-level cache
_cached_ollama_models = None


def get_ollama_client() -> AsyncClient:
    api_url = Environment.get("OLLAMA_API_URL")
    assert api_url, "OLLAMA_API_URL not set"

    api_key = Environment.get("OLLAMA_API_KEY")
    if api_key:
        headers = {"Authorization": f"Bearer {api_key}"}
    else:
        headers = {}
    return AsyncClient(api_url, headers=headers)


async def get_ollama_models() -> list[LlamaModel]:
    global _cached_ollama_models

    if Environment.is_production() and _cached_ollama_models is not None:
        return _cached_ollama_models

    ollama = get_ollama_client()
    models = await ollama.list()
    result = [
        LlamaModel(
            name=model.model or "",
            repo_id=model.model or "",
            modified_at=model.modified_at.isoformat() if model.modified_at else "",
            size=model.size or 0,
            digest=model.digest or "",
            details=model.details.model_dump() if model.details else {},
        )
        for model in models.models
    ]

    if Environment.is_production():
        _cached_ollama_models = result
    return result


async def get_ollama_model_info(model_name: str) -> dict | None:
    ollama = get_ollama_client()
    try:
        res = await ollama.show(model_name)
    except Exception:
        return None
    return res.model_dump()


async def stream_ollama_model_pull(model_name: str) -> AsyncGenerator[str, None]:
    ollama = get_ollama_client()
    res = await ollama.pull(model_name, stream=True)
    async for chunk in res:
        yield json.dumps(chunk.model_dump()) + "\n"
