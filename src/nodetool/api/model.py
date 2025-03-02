#!/usr/bin/env python

from fastapi.responses import StreamingResponse
import openai
from nodetool.common.huggingface_cache import has_cached_files
from nodetool.common.huggingface_file import (
    HFFileInfo,
    HFFileRequest,
    get_huggingface_file_infos,
)
from nodetool.common.environment import Environment
from nodetool.metadata.types import (
    ModelFile,
    HuggingFaceModel,
    LlamaModel,
    OpenAIModel,
    comfy_model_to_folder,
)
from huggingface_hub import try_to_load_from_cache
from nodetool.api.utils import current_user
from nodetool.models.user import User
from fastapi import APIRouter, Depends
from nodetool.metadata.types import LlamaModel
from nodetool.common.huggingface_models import (
    CachedModel,
    delete_cached_hf_model,
    read_cached_hf_models,
)
from nodetool.workflows.base_node import get_recommended_models
from pydantic import BaseModel, Field
from nodetool.common.system_stats import SystemStats, get_system_stats
from nodetool.chat.ollama_service import (
    get_ollama_models,
    get_ollama_model_info,
    stream_ollama_model_pull,
)

log = Environment.get_logger()
router = APIRouter(prefix="/api/models", tags=["models"])

# Simple module-level cache
_cached_huggingface_models = None


class RepoPath(BaseModel):
    repo_id: str
    path: str
    downloaded: bool = False


class CachedRepo(BaseModel):
    repo_id: str
    downloaded: bool = False


@router.get("/recommended_models")
async def recommended_models(
    user: User = Depends(current_user),
) -> list[HuggingFaceModel]:
    return list(get_recommended_models().values())  # type: ignore


@router.get("/huggingface_models")
async def get_huggingface_models(
    user: User = Depends(current_user),
) -> list[CachedModel]:
    global _cached_huggingface_models

    if Environment.is_production() and _cached_huggingface_models is not None:
        return _cached_huggingface_models

    models = await read_cached_hf_models()
    if Environment.is_production():
        _cached_huggingface_models = models
    return models


@router.delete("/huggingface_model")
async def delete_huggingface_model(repo_id: str) -> bool:
    if Environment.is_production():
        log.warning("Cannot delete models in production")
        return False
    return delete_cached_hf_model(repo_id)


@router.get("/ollama_models")
async def get_ollama_models_endpoint(
    user: User = Depends(current_user),
) -> list[LlamaModel]:
    return await get_ollama_models()


@router.get("/openai_models")
async def get_openai_models_endpoint(
    user: User = Depends(current_user),
) -> list[OpenAIModel]:
    env = Environment.get_environment()
    api_key = env.get("OPENAI_API_KEY")
    assert api_key, "OPENAI_API_KEY is not set"

    client = openai.AsyncClient(api_key=api_key)
    res = await client.models.list()
    return [
        OpenAIModel(
            id=model.id,
            object=model.object,
            created=model.created,
            owned_by=model.owned_by,
        )
        for model in res.data
    ]


@router.get("/ollama_model_info")
async def get_ollama_model_info_endpoint(
    model_name: str, user: User = Depends(current_user)
) -> dict | None:
    return await get_ollama_model_info(model_name)


@router.post("/huggingface/try_cache_files")
async def try_cache_files(
    paths: list[RepoPath],
    user: User = Depends(current_user),
) -> list[RepoPath]:
    def check_path(path: RepoPath) -> bool:
        return try_to_load_from_cache(path.repo_id, path.path) is not None

    return [
        RepoPath(repo_id=path.repo_id, path=path.path, downloaded=check_path(path))
        for path in paths
    ]


@router.post("/huggingface/try_cache_repos")
async def try_cache_repos(
    repos: list[str],
    user: User = Depends(current_user),
) -> list[CachedRepo]:
    def check_repo(repo_id: str) -> bool:
        return has_cached_files(repo_id)

    return [
        CachedRepo(repo_id=repo_id, downloaded=check_repo(repo_id)) for repo_id in repos
    ]


if not Environment.is_production():

    @router.post("/pull_ollama_model")
    async def pull_ollama_model(model_name: str, user: User = Depends(current_user)):
        return StreamingResponse(
            stream_ollama_model_pull(model_name), media_type="application/json"
        )

    @router.post("/huggingface/file_info")
    async def get_huggingface_file_info(
        requests: list[HFFileRequest],
        user: User = Depends(current_user),
    ) -> list[HFFileInfo]:
        return get_huggingface_file_infos(requests)

    @router.get("/{model_type}")
    async def index(
        model_type: str, user: User = Depends(current_user)
    ) -> list[ModelFile]:
        folder = comfy_model_to_folder(model_type)
        import folder_paths

        files = folder_paths.get_filename_list(folder)

        return [ModelFile(type=folder, name=file) for file in files]
