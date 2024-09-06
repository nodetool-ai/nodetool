#!/usr/bin/env python

import asyncio
import httpx
from nodetool.common.environment import Environment
from nodetool.api.utils import current_user
from nodetool.metadata.types import (
    FunctionModel,
    HuggingFaceModel,
    LlamaModel,
    pipeline_tag_to_model_type,
)
from nodetool.models.user import User
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
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
    return await Environment.get_llama_models()


@router.get("/function_models")
async def function_model(user: User = Depends(current_user)) -> list[FunctionModel]:
    return Environment.get_function_models()


def get_recommended_models() -> dict[str, HuggingFaceModel]:
    node_classes = get_registered_node_classes()
    return {
        model.repo_id: model
        for node_class in node_classes
        for model in node_class.get_recommended_models()
    }


async def augment_model_info(
    model: CachedModel, models: dict[str, HuggingFaceModel]
) -> CachedModel:
    client = httpx.AsyncClient()
    res = await client.get(f"https://huggingface.co/api/models/{model.repo_id}")
    if res.status_code != 200:
        return model
    model_info = res.json()
    model.pipeline_tag = model_info.get("pipeline_tag", None)
    if model.repo_id in models:
        model.model_type = models[model.repo_id].type
    else:
        model.model_type = pipeline_tag_to_model_type(model.pipeline_tag)

    return model


@router.get("/recommended_models")
async def recommended_models(
    user: User = Depends(current_user),
) -> list[HuggingFaceModel]:
    return get_recommended_models()


@router.get("/huggingface_models")
async def get_huggingface_models(
    user: User = Depends(current_user),
) -> list[CachedModel]:
    models = read_all_cached_models()
    recommended_models = get_recommended_models()
    models = await asyncio.gather(
        *[augment_model_info(model, recommended_models) for model in models]
    )
    return models


@router.delete("/huggingface_model")
async def delete_huggingface_model(repo_id: str) -> bool:
    if Environment.is_production():
        log.warning("Cannot delete models in production")
        return False
    return delete_cached_model(repo_id)


@router.get("/{folder}")
async def index(folder: str, user: User = Depends(current_user)) -> list[str]:
    return await Environment.get_model_files(folder)
