from huggingface_hub import scan_cache_dir, snapshot_download
from typing import List, Optional, Any
from pydantic import BaseModel
import asyncio
import sys
import os
import json
import shutil
from huggingface_hub import HfFolder
import subprocess


class CachedModel(BaseModel):
    repo_id: str
    repo_type: str
    size_on_disk: int


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


def read_cached_model(model_id: str) -> Optional[CachedModel]:
    """
    Reads information about a specific model from the Hugging Face cache.

    Args:
        model_id (str): The ID of the model to look for.

    Returns:
        Optional[CachedModel]: A CachedModel object containing model information if found, None otherwise.
    """
    cache_info = scan_cache_dir()
    for repo in cache_info.repos:
        if repo.repo_type == "model" and repo.repo_id == model_id:
            return CachedModel(
                repo_id=repo.repo_id,
                repo_type=repo.repo_type,
                size_on_disk=repo.size_on_disk,
            )
    return None


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


from tqdm.std import tqdm as std_tqdm


class CustomTqdm(std_tqdm):

    def update(self, n):
        self.n = n
        progress = min(100, int(self.n / self.total * 100))
        print(
            json.dumps(
                {
                    "progress": progress,
                    "desc": self.desc,
                    "current": self.n,
                    "total": self.total,
                }
            ),
            flush=True,
        )


async def download_huggingface_model(repo_id: str):
    command = [sys.executable, __file__, repo_id]
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        universal_newlines=True,
    )

    assert process.stdout is not None
    assert process.stderr is not None

    def read_stream(stream):
        for line in stream:
            try:
                decoded_line = json.loads(line)
                yield json.dumps(decoded_line)
            except json.JSONDecodeError:
                pass

    while process.poll() is None:
        for line in read_stream(process.stdout):
            yield line
        for line in read_stream(process.stderr):
            yield line
        await asyncio.sleep(0.1)

    # Read any remaining output after the process has finished
    for line in read_stream(process.stdout):
        yield line
    for line in read_stream(process.stderr):
        yield line


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python huggingface_models.py <repo_id>")
        sys.exit(1)

    repo_id = sys.argv[1]

    snapshot_download(repo_id, tqdm_class=CustomTqdm)  # type: ignore
