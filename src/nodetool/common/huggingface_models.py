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


async def download_huggingface_model(
    repo_id: str, websocket: WebSocket, cancel_event: asyncio.Event
):
    try:
        script = f"""
import sys
from huggingface_hub import snapshot_download
snapshot_download('{repo_id}')
"""

        process = await asyncio.create_subprocess_shell(
            f'{sys.executable} -c "{script}"',
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env={**os.environ, "PYTHONUNBUFFERED": "1"},
        )

        async def read_stream(stream):
            while True:
                if cancel_event.is_set():
                    break
                line = await stream.readline()
                if not line:
                    break
                line = line.decode().strip()
                print(line)
                await websocket.send_text(line)

        await asyncio.gather(
            read_stream(process.stdout),
            read_stream(process.stderr),
        )

        if cancel_event.is_set():
            process.terminate()
            await websocket.send_text("Download cancelled")
        else:
            await process.wait()

            if process.returncode == 0:
                await websocket.send_text("Download completed")
            else:
                await websocket.send_text(f"Download failed")

    except Exception as e:
        error_message = str(e)
        await websocket.send_json({"status": "error", "message": error_message})
        print("An error occurred during download:")
        import traceback

        traceback.print_exc()


async def test_hf_download(repo_id):
    uri = f"ws://localhost:8000/hf/download?repo_id={repo_id}"

    async with websockets.connect(uri) as websocket:
        print(f"Connected to WebSocket. Downloading {repo_id}...")

        while True:
            try:
                message = await websocket.recv()
                print(message)
            except websockets.exceptions.ConnectionClosed:
                print("Connection closed unexpectedly")
                break


if __name__ == "__main__":
    asyncio.run(test_hf_download(sys.argv[1]))
