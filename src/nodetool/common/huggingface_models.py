from huggingface_hub import scan_cache_dir, snapshot_download
from typing import List, Optional, Any
from pydantic import BaseModel
import asyncio
import sys
import os
import json
import shutil
from huggingface_hub import HfFolder


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
    process = await asyncio.create_subprocess_exec(
        sys.executable,
        __file__,
        repo_id,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )

    assert process.stdout is not None
    assert process.stderr is not None

    stdout_queue = asyncio.Queue()
    stderr_queue = asyncio.Queue()

    async def read_stream(stream, queue):
        while True:
            line = await stream.readline()
            if not line:
                break
            await queue.put(line)

    stdout_task = asyncio.create_task(read_stream(process.stdout, stdout_queue))
    stderr_task = asyncio.create_task(read_stream(process.stderr, stderr_queue))

    while (
        not stdout_task.done()
        or not stderr_task.done()
        or not stdout_queue.empty()
        or not stderr_queue.empty()
    ):
        try:
            line = stdout_queue.get_nowait()
            try:
                decoded_line = json.loads(line.decode())
                yield decoded_line
            except json.JSONDecodeError:
                pass
        except asyncio.QueueEmpty:
            pass

        try:
            line = stderr_queue.get_nowait()
            try:
                decoded_line = json.loads(line.decode())
                yield decoded_line
            except json.JSONDecodeError:
                pass
        except asyncio.QueueEmpty:
            pass

        await asyncio.sleep(0.1)

    await stdout_task
    await stderr_task
    await process.wait()


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python huggingface_models.py <repo_id>")
        sys.exit(1)

    repo_id = sys.argv[1]

    snapshot_download(repo_id, tqdm_class=CustomTqdm)  # type: ignore
