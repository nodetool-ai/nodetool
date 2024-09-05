import asyncio
from fnmatch import fnmatch
import sys
import json
from typing import Callable, Iterable, List, Literal, Optional, Union
from fastapi import FastAPI, WebSocket
from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.hf_api import RepoFile
import huggingface_hub.file_download
from multiprocessing import Manager
from queue import Empty
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
import threading

from torch import Generator

from nodetool.workflows.base_node import get_node_class


def filter_repo_paths(
    items: list[RepoFile],
    allow_patterns: list[str] | None = None,
    ignore_patterns: list[str] | None = None,
) -> list[RepoFile]:
    """Filter repo objects based on an allowlist and a denylist.

    Patterns are Unix shell-style wildcards which are NOT regular expressions. See
    https://docs.python.org/3/library/fnmatch.html for more details.

    Args:
        items (list[RepoFile]):
            List of items to filter.
        allow_patterns (`str` or `List[str]`, *optional*):
            Patterns constituting the allowlist. If provided, item paths must match at
            least one pattern from the allowlist.
        ignore_patterns (`str` or `List[str]`, *optional*):
            Patterns constituting the denylist. If provided, item paths must not match
            any patterns from the denylist.

    Returns:
        Filtered list of paths

    ```
    """
    if isinstance(allow_patterns, str):
        allow_patterns = [allow_patterns]

    if isinstance(ignore_patterns, str):
        ignore_patterns = [ignore_patterns]

    filtered_paths = []
    for file in items:
        path = file.path
        # Skip if there's an allowlist and path doesn't match any
        if allow_patterns is not None and not any(
            fnmatch(path, r) for r in allow_patterns
        ):
            continue

        # Skip if there's a denylist and path matches any
        if ignore_patterns is not None and any(
            fnmatch(path, r) for r in ignore_patterns
        ):
            continue

        filtered_paths.append(file)

    return filtered_paths


class DownloadManager:
    websocket: WebSocket
    cancel: asyncio.Event
    downloaded_bytes: int = 0
    total_bytes: int = 0
    repo_id: str = ""
    status: (
        Literal["idle"]
        | Literal["progress"]
        | Literal["start"]
        | Literal["error"]
        | Literal["completed"]
        | Literal["cancelled"]
    ) = "idle"

    def __init__(self):
        self.api = HfApi()
        self.status = "idle"

    async def start_download(
        self,
        repo_id: str,
        websocket: WebSocket,
        allow_patterns: list[str] | None = None,
        ignore_patterns: list[str] | None = None,
    ):
        if self.status == "running":
            await websocket.send_json(
                {"status": "error", "message": "Download already in progress"}
            )
            return
        self.process_pool = ProcessPoolExecutor()
        self.manager = Manager()
        self.queue = self.manager.Queue()
        self.status = "start"
        self.cancel = asyncio.Event()
        self.repo_id = repo_id
        self.downloaded_bytes = 0
        self.downloaded_files = []
        self.current_files = []
        self.total_files = 0
        self.total_bytes = 0
        self.websocket = websocket
        self.progress_running = True

        # Start the progress updates in a separate thread
        self.progress_thread = threading.Thread(target=self.run_progress_updates)
        self.progress_thread.start()

        try:
            await self.download_huggingface_repo(
                repo_id=repo_id,
                allow_patterns=allow_patterns,
                ignore_patterns=ignore_patterns,
            )
        except Exception as e:
            print(f"Error in download: {e}")
            self.status = "error"
            await self.send_update()
        finally:
            self.process_pool.shutdown()
            self.manager.shutdown()
            self.progress_running = False

    async def cancel_download(self):
        self.cancel.set()
        self.process_pool.shutdown()
        self.manager.shutdown()

    def run_progress_updates(self):
        asyncio.run(self.send_progress_updates())

    async def send_update(self):
        await self.websocket.send_json(
            {
                "status": self.status,
                "repo_id": self.repo_id,
                "downloaded_bytes": self.downloaded_bytes,
                "total_bytes": self.total_bytes,
                "downloaded_files": len(self.downloaded_files),
                "current_files": self.current_files,
                "total_files": self.total_files,
            }
        )

    async def send_progress_updates(self):
        while self.progress_running:
            try:
                message = self.queue.get(timeout=0.1)
                if message:
                    self.status = "progress"
                    self.downloaded_bytes += message["n"]
                    await self.send_update()
            except TimeoutError:
                pass
            except Empty:
                pass
            except EOFError:
                pass
            except BrokenPipeError:
                pass
            except Exception as e:
                import traceback

                traceback.print_exc()

    async def download_huggingface_repo(
        self,
        repo_id: str,
        allow_patterns: list[str] | None = None,
        ignore_patterns: list[str] | None = None,
    ):
        files = self.api.list_repo_tree(repo_id, recursive=True)
        files = [file for file in files if isinstance(file, RepoFile)]
        files = filter_repo_paths(files, allow_patterns, ignore_patterns)
        self.total_files = len(files)
        self.total_bytes = sum(file.size for file in files)
        await self.send_update()

        loop = asyncio.get_running_loop()
        tasks = []
        for file in files:
            if self.cancel.is_set():
                break
            self.current_files.append(file.path)
            await self.send_update()
            task = loop.run_in_executor(
                self.process_pool,
                download_file,
                repo_id,
                file.path,
                self.queue,
            )
            tasks.append(task)

            # Schedule 2 download processes in parallel
            if len(tasks) == 2:
                completed_tasks = await asyncio.gather(*tasks)
                for filename, local_path in completed_tasks:
                    if local_path:
                        self.downloaded_files.append(filename)
                    self.current_files.remove(filename)
                await self.send_update()

        # Handle any remaining tasks
        if tasks:
            completed_tasks = await asyncio.gather(*tasks)
            for filename, local_path in completed_tasks:
                if local_path:
                    self.downloaded_files.append(filename)
                self.current_files.remove(filename)
            await self.send_update()

        self.status = "completed"

        if self.cancel.is_set():
            self.status = "cancelled"

        await self.send_update()


# This will be used to send progress updates to the client
# It will be set only in the sub processes
parent_queue = None


def download_file(repo_id, filename, queue):
    global parent_queue
    parent_queue = queue

    local_path = hf_hub_download(
        repo_id=repo_id,
        filename=filename,
    )
    return filename, local_path


class CustomTqdm(huggingface_hub.file_download.tqdm):
    def update(self, n=1):
        if n and parent_queue:
            parent_queue.put({"n": n})
        super().update(n)


# Replace the tqdm used by huggingface_hub
huggingface_hub.file_download.tqdm = CustomTqdm


async def websocket_endpoint(websocket: WebSocket):
    download_manager = DownloadManager()
    await websocket.accept()
    try:
        while True:
            data = await websocket.receive_json()
            command = data.get("command")
            repo_id = data.get("repo_id")
            allow_patterns = data.get("allow_patterns")
            ignore_patterns = data.get("ignore_patterns")

            if command == "start_download":
                await download_manager.start_download(
                    repo_id=repo_id,
                    websocket=websocket,
                    allow_patterns=allow_patterns,
                    ignore_patterns=ignore_patterns,
                )
            elif command == "cancel_download":
                await download_manager.cancel_download()
            else:
                await websocket.send_json(
                    {"status": "error", "message": "Unknown command"}
                )
    except Exception as e:
        print(f"WebSocket error: {e}")
        # print stacktrace
        import traceback

        traceback.print_exc()
    finally:
        await websocket.close()


if __name__ == "__main__":
    if sys.argv[1] == "server":
        from fastapi import FastAPI
        import uvicorn

        app = FastAPI()
        app.add_websocket_route("/ws", websocket_endpoint)

        uvicorn.run(app, host="0.0.0.0", port=8000)
    elif sys.argv[1] == "test":
        import websockets

        repo_id = sys.argv[2]

        async def test():
            async with websockets.connect("ws://localhost:8000/ws") as websocket:
                await websocket.send(
                    json.dumps({"command": "start_download", "repo_id": repo_id})
                )
                while True:
                    data = await websocket.recv()
                    print(data)

        asyncio.run(test(), debug=True)
    else:
        print("Usage: python download_manager.py server|test <repo_id>")
