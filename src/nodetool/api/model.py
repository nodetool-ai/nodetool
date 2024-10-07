#!/usr/bin/env python

import json
from fastapi.responses import StreamingResponse
import psutil
import torch
from nodetool.common.environment import Environment
from nodetool.metadata.types import (
    ModelFile,
    HuggingFaceModel,
    LlamaModel,
    comfy_model_to_folder,
)
from huggingface_hub import try_to_load_from_cache
from huggingface_hub import HfFileSystem
from nodetool.api.utils import current_user
from nodetool.models.user import User
from fastapi import APIRouter, Depends
from nodetool.metadata.types import LlamaModel
from nodetool.common.huggingface_models import (
    CachedModel,
    delete_cached_model,
    read_all_cached_models,
)
from nodetool.workflows.base_node import get_recommended_models
from pydantic import BaseModel, Field

log = Environment.get_logger()
router = APIRouter(prefix="/api/models", tags=["models"])


class SystemStats(BaseModel):
    cpu_percent: float = Field(..., description="CPU usage percentage")
    memory_total_gb: float = Field(..., description="Total memory in GB")
    memory_used_gb: float = Field(..., description="Used memory in GB")
    memory_percent: float = Field(..., description="Memory usage percentage")
    vram_total_gb: float | None = Field(None, description="Total VRAM in GB")
    vram_used_gb: float | None = Field(None, description="Used VRAM in GB")
    vram_percent: float | None = Field(None, description="VRAM usage percentage")


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


class RepoPath(BaseModel):
    repo_id: str
    path: str
    downloaded: bool = False


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


@router.delete("/huggingface_model")
async def delete_huggingface_model(repo_id: str) -> bool:
    if Environment.is_production():
        log.warning("Cannot delete models in production")
        return False
    return delete_cached_model(repo_id)


@router.get("/ollama_models")
async def get_ollama_models(user: User = Depends(current_user)) -> list[LlamaModel]:
    ollama = Environment.get_ollama_client()
    models = await ollama.list()
    return [
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


@router.get("/ollama_model_info")
async def get_ollama_model_info(
    model_name: str, user: User = Depends(current_user)
) -> dict | None:
    ollama = Environment.get_ollama_client()
    try:
        res = await ollama.show(model_name)
    except Exception as e:
        return None
    return dict(res)


@router.post("/pull_ollama_model")
async def pull_ollama_model(model_name: str, user: User = Depends(current_user)):
    async def stream_response():
        ollama = Environment.get_ollama_client()
        res = await ollama.pull(model_name, stream=True)
        async for chunk in res:
            yield json.dumps(chunk) + "\n"

    return StreamingResponse(stream_response(), media_type="application/json")


@router.get("/system_stats", response_model=SystemStats)
async def get_system_stats(user: User = Depends(current_user)) -> SystemStats:
    # CPU usage
    cpu_percent = psutil.cpu_percent(interval=1)

    # Memory usage
    memory = psutil.virtual_memory()
    memory_total = memory.total / (1024**3)  # Convert to GB
    memory_used = memory.used / (1024**3)  # Convert to GB
    memory_percent = memory.percent

    # VRAM usage (if GPU is available)
    vram_total = vram_used = vram_percent = None
    if torch.cuda.is_available():
        vram_total = torch.cuda.get_device_properties(0).total_memory / (1024**3)
        vram_used = torch.cuda.memory_allocated(0) / (1024**3)
        vram_percent = (vram_used / vram_total) * 100

    return SystemStats(
        cpu_percent=cpu_percent,
        memory_total_gb=round(memory_total, 2),
        memory_used_gb=round(memory_used, 2),
        memory_percent=memory_percent,
        vram_total_gb=round(vram_total, 2) if vram_total is not None else None,
        vram_used_gb=round(vram_used, 2) if vram_used is not None else None,
        vram_percent=round(vram_percent, 2) if vram_percent is not None else None,
    )


class HFFileInfo(BaseModel):
    size: int
    repo_id: str
    path: str


class HFFileRequest(BaseModel):
    repo_id: str
    path: str


@router.post("/huggingface/file_info")
async def get_huggingface_file_info(
    requests: list[HFFileRequest],
    user: User = Depends(current_user),
) -> list[HFFileInfo]:
    fs = HfFileSystem()
    file_infos = []

    for request in requests:
        file_info = fs.info(f"{request.repo_id}/{request.path}")
        file_infos.append(
            HFFileInfo(
                size=file_info["size"],
                repo_id=request.repo_id,
                path=request.path,
            )
        )

    return file_infos


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
