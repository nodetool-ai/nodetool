import json
from typing import AsyncGenerator
from nodetool.common.environment import Environment
from nodetool.metadata.types import LlamaModel

# Simple module-level cache
_cached_ollama_models = None


async def get_ollama_models() -> list[LlamaModel]:
    global _cached_ollama_models

    if Environment.is_production() and _cached_ollama_models is not None:
        return _cached_ollama_models

    ollama = Environment.get_ollama_client()
    models = await ollama.list()
    result = [
        LlamaModel(
            name=model["name"],
            repo_id=model["name"],
            modified_at=model["modified_at"],
            size=model["size"],
            digest=model["digest"],
            details=model["details"],
        )
        for model in models["models"]
    ]

    if Environment.is_production():
        _cached_ollama_models = result
    return result


async def get_ollama_model_info(model_name: str) -> dict | None:
    ollama = Environment.get_ollama_client()
    try:
        res = await ollama.show(model_name)
    except Exception:
        return None
    return dict(res)


async def stream_ollama_model_pull(model_name: str) -> AsyncGenerator[str, None]:
    ollama = Environment.get_ollama_client()
    res = await ollama.pull(model_name, stream=True)
    async for chunk in res:
        yield json.dumps(chunk) + "\n"