#!/usr/bin/env python

import asyncio
import httpx
from nodetool.common.environment import Environment
from nodetool.metadata.types import (
    FunctionModel,
    GPTModel,
    AnthropicModel,
    ModelFile,
    Provider,
    FunctionModel,
    Provider,
    FunctionModel,
    HuggingFaceModel,
    LlamaModel,
    comfy_model_to_folder,
    pipeline_tag_to_model_type,
)
import ollama
from huggingface_hub import try_to_load_from_cache
from nodetool.api.utils import current_user
from nodetool.models.user import User
from fastapi import APIRouter, Depends
from nodetool.metadata.types import LlamaModel
from nodetool.common.huggingface_models import (
    CachedModel,
    delete_cached_model,
    read_all_cached_models,
)
from nodetool.workflows.base_node import get_registered_node_classes

log = Environment.get_logger()
router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("/llama_models")
async def llama_model(user: User = Depends(current_user)) -> list[LlamaModel]:
    ollama = Environment.get_ollama_client()
    models = await ollama.list()

    return [LlamaModel(**model) for model in models["models"]]


@router.get("/function_models")
async def function_model(user: User = Depends(current_user)) -> list[FunctionModel]:
    models = [
        FunctionModel(
            provider=Provider.OpenAI,
            name=GPTModel.GPT4.value,
        ),
        FunctionModel(
            provider=Provider.OpenAI,
            name=GPTModel.GPT4Mini.value,
        ),
        FunctionModel(
            provider=Provider.Anthropic, name=AnthropicModel.claude_3_5_sonnet
        ),
    ]

    if not Environment.is_production():
        # TODO: hardcode list of models for production
        models = ollama.list()["models"]
        return [
            FunctionModel(provider=Provider.Ollama, name=model["name"])
            for model in models
            if model["name"].startswith("mistra")
        ]

    return models


def get_recommended_models() -> dict[str, list[HuggingFaceModel]]:
    node_classes = get_registered_node_classes()
    models = {}
    for node_class in node_classes:
        for model in node_class.get_recommended_models():
            if model.repo_id not in models:
                models[model.repo_id] = []
            models[model.repo_id].append(model)
    return models


@router.get("/recommended_models")
async def recommended_models(
    user: User = Depends(current_user),
) -> list[HuggingFaceModel]:
    return list(get_recommended_models().values())  # type: ignore


@router.get("/huggingface_models")
async def get_huggingface_models(
    user: User = Depends(current_user),
) -> list[CachedModel]:
    return await read_all_cached_models()


@router.get("/huggingface/try_cache_file")
async def get_huggingface_lora_sd(
    repo_id: str,
    path: str,
    user: User = Depends(current_user),
) -> bool:
    return try_to_load_from_cache(repo_id, path) is not None


@router.delete("/huggingface_model")
async def delete_huggingface_model(repo_id: str) -> bool:
    if Environment.is_production():
        log.warning("Cannot delete models in production")
        return False
    return delete_cached_model(repo_id)


@router.get("/{model_type}")
async def index(model_type: str, user: User = Depends(current_user)) -> list[ModelFile]:
    folder = comfy_model_to_folder(model_type)
    worker_client = Environment.get_worker_api_client()
    if worker_client:
        res = await worker_client.get(f"/models/{folder}")
        return res.json()
    else:
        import folder_paths

        files = folder_paths.get_filename_list(folder)

        return [ModelFile(type=folder, name=file) for file in files]
