import asyncio
from datetime import datetime
import httpx
from pydantic import Field
from huggingface_hub import scan_cache_dir
from typing import Any, List, Optional
from pydantic import BaseModel
import sys
import os
import shutil
from fastapi import FastAPI

from nodetool.common.environment import Environment
from nodetool.metadata.types import CLASSNAME_TO_MODEL_TYPE, HuggingFaceModel
from nodetool.workflows.base_node import get_recommended_models

log = Environment.get_logger()

# Add a new in-memory cache
model_info_cache = {}
readme_cache = {}


class Sibling(BaseModel):
    rfilename: str


class ModelInfo(BaseModel):
    _id: str
    id: str
    modelId: str
    author: str
    sha: str
    lastModified: datetime
    private: bool
    disabled: bool
    gated: bool | str
    pipeline_tag: str | None = None
    tags: List[str]
    downloads: int
    library_name: str | None = None
    likes: int
    model_index: Optional[Any] = Field(None, alias="model-index")
    config: dict | None = None
    cardData: dict | None = None
    siblings: List[Sibling] | None = None
    spaces: List[str] | None = None
    createdAt: datetime


async def fetch_model_readme(model_id: str) -> str | None:
    """
    Fetches the readme from the Hugging Face API or cache
    using httpx
    https://huggingface.co/{model_id}/raw/main/README.md

    Args:
        model_id (str): The ID of the model to fetch.

    Returns:
        str: The readme.
    """
    if model_id in readme_cache:
        return readme_cache[model_id]

    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"https://huggingface.co/{model_id}/raw/main/README.md"
        )
        if response.status_code != 200:
            readme_cache[model_id] = None
            return None
        readme_cache[model_id] = response.text
        return response.text


async def fetch_model_info(model_id: str) -> ModelInfo | None:
    """
    Fetches model info from the Hugging Face API or cache
    using httpx
    https://huggingface.co/api/models/{model_id}

    Args:
        model_id (str): The ID of the model to fetch.

    Returns:
        ModelInfo: The model info.
    """
    # Check if the model info is in the cache
    if model_id in model_info_cache:
        return model_info_cache[model_id]

    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"https://huggingface.co/api/models/{model_id}")
        except httpx.ConnectError as e:
            log.info("Huggingface not reachable")
            return None

        if response.status_code != 200:
            model_info_cache[model_id] = None
            return None

        model_info = ModelInfo(**response.json())

        # Cache the model info
        model_info_cache[model_id] = model_info
        return model_info


app = FastAPI()


class CachedModel(BaseModel):
    repo_id: str
    repo_type: str
    size_on_disk: int
    model_type: Optional[str] = None
    model_info: ModelInfo | None = None
    readme: str | None = None


def model_type_from_model_info(
    recommended_models: dict[str, list[HuggingFaceModel]],
    repo_id: str,
    model_info: ModelInfo | None,
) -> str | None:
    recommended = recommended_models.get(repo_id, [])
    if len(recommended) == 1:
        return recommended[0].type
    if model_info is None:
        return None
    if (
        model_info.config
        and "diffusers" in model_info.config
        and "_class_name" in model_info.config["diffusers"]
    ):
        return CLASSNAME_TO_MODEL_TYPE.get(
            model_info.config["diffusers"]["_class_name"], None
        )
    if model_info.pipeline_tag:
        name = model_info.pipeline_tag.replace("-", "_")
        return f"hf.{name}"
    return None


async def read_all_cached_models(load_model_info: bool = True) -> List[CachedModel]:
    """
    Reads all models from the Hugging Face cache.

    Returns:
        List[CachedModel]: A list of CachedModel objects found in the cache.
    """
    cache_info = scan_cache_dir()
    model_repos = [repo for repo in cache_info.repos if repo.repo_type == "model"]
    recommended_models = get_recommended_models()
    if load_model_info:
        model_infos = await asyncio.gather(
            *[fetch_model_info(repo.repo_id) for repo in model_repos]
        )
    else:
        model_infos = [None] * len(model_repos)
    models = [
        CachedModel(
            repo_id=repo.repo_id,
            repo_type=repo.repo_type,
            size_on_disk=repo.size_on_disk,
            model_info=model_info,
            model_type=model_type_from_model_info(
                recommended_models, repo.repo_id, model_info
            ),
        )
        for repo, model_info in zip(model_repos, model_infos)
    ]
    return models


def delete_cached_model(model_id: str) -> bool:
    """
    Deletes a model from the Hugging Face cache and the in-memory cache.

    Args:
        model_id (str): The ID of the model to delete.
    """
    cache_info = scan_cache_dir()
    for repo in cache_info.repos:
        if repo.repo_type == "model" and repo.repo_id == model_id:
            if os.path.exists(repo.repo_path):
                shutil.rmtree(repo.repo_path)
                # Remove the model info from the in-memory cache
                model_info_cache.pop(model_id, None)
                return True
    return False
