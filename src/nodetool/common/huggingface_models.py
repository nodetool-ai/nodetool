import threading
from huggingface_hub import scan_cache_dir, snapshot_download
import websockets
import json
import sys
from typing import List, Optional, Any
from pydantic import BaseModel
import asyncio
import sys
import os
import shutil
from huggingface_hub import HfFolder
import subprocess
from fastapi import FastAPI, WebSocket
from fastapi.responses import JSONResponse
from typing import AsyncGenerator
from huggingface_hub import snapshot_download, HfApi
from huggingface_hub.utils import RepositoryNotFoundError

app = FastAPI()


class CachedModel(BaseModel):
    repo_id: str
    repo_type: str
    size_on_disk: int
    pipeline_tag: Optional[str] = None
    model_type: Optional[str] = None


def read_all_cached_models() -> List[CachedModel]:
    """
    Reads all models from the Hugging Face cache.

    Returns:
        List[CachedModel]: A list of CachedModel objects found in the cache.
    """
    cache_info = scan_cache_dir()
    models = [
        CachedModel(
            repo_id=repo.repo_id,
            repo_type=repo.repo_type,
            size_on_disk=repo.size_on_disk,
        )
        for repo in cache_info.repos
        if repo.repo_type == "model"
    ]
    return models


def delete_cached_model(model_id: str) -> bool:
    """
    Deletes a model from the Hugging Face cache.

    Args:
        model_id (str): The ID of the model to delete.
    """
    cache_info = scan_cache_dir()
    for repo in cache_info.repos:
        if repo.repo_type == "model" and repo.repo_id == model_id:
            if os.path.exists(repo.repo_path):
                shutil.rmtree(repo.repo_path)
                return True
    return False
