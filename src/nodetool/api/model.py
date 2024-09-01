#!/usr/bin/env python

from nodetool.common.environment import Environment
from nodetool.api.utils import current_user
from nodetool.metadata.types import FunctionModel, LlamaModel
from nodetool.models.user import User
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from nodetool.common.huggingface_models import (
    CachedModel,
    delete_cached_model,
    read_all_cached_models,
    read_cached_model,
)

log = Environment.get_logger()
router = APIRouter(prefix="/api/models", tags=["models"])


@router.get("/llama_models")
async def llama_model(user: User = Depends(current_user)) -> list[LlamaModel]:
    return await Environment.get_llama_models()


@router.get("/function_models")
async def function_model(user: User = Depends(current_user)) -> list[FunctionModel]:
    return Environment.get_function_models()


@router.get("/huggingface_models")
async def get_huggingface_models(
    user: User = Depends(current_user),
) -> list[CachedModel]:
    return read_all_cached_models()


@router.get("/huggingface_model")
async def get_huggingface_model(repo_id: str) -> CachedModel | None:
    return read_cached_model(repo_id)


@router.delete("/huggingface_model")
async def delete_huggingface_model(repo_id: str) -> bool:
    if Environment.is_production():
        log.warning("Cannot delete models in production")
        return False
    return delete_cached_model(repo_id)


@router.get("/{folder}")
async def index(folder: str, user: User = Depends(current_user)) -> list[str]:
    return await Environment.get_model_files(folder)
