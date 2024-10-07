import asyncio
from dataclasses import dataclass, field
from fnmatch import fnmatch
import logging
import traceback
from typing import Literal
from fastapi import WebSocket
from huggingface_hub import HfApi, hf_hub_download, try_to_load_from_cache
from huggingface_hub.hf_api import RepoFile
import huggingface_hub.file_download
from multiprocessing import Manager
from queue import Empty, Queue
from concurrent.futures import ProcessPoolExecutor
import threading
import os


@dataclass
class DownloadState:
    repo_id: str
    websocket: WebSocket
    cancel: asyncio.Event = field(default_factory=asyncio.Event)
    downloaded_bytes: int = 0
    total_bytes: int = 0
    status: Literal["idle", "progress", "start", "error", "completed", "cancelled"] = (
        "idle"
    )
    downloaded_files: list[str] = field(default_factory=list)
    current_files: list[str] = field(default_factory=list)
    total_files: int = 0


def get_repo_size(
    repo_id: str,
    allow_patterns: list[str] | None = None,
    ignore_patterns: list[str] | None = None,
) -> int:
    """
    Get the total size of files in a Hugging Face repository that match the given patterns.

    Args:
        repo_id (str): The ID of the Hugging Face repository.
        allow_patterns (list[str] | None): List of patterns to allow.
        ignore_patterns (list[str] | None): List of patterns to ignore.

    Returns:
        int: Total size of matching files in bytes.
    """
    api = HfApi()
    files = api.list_repo_tree(repo_id, recursive=True)
    files = [file for file in files if isinstance(file, RepoFile)]
    filtered_files = filter_repo_paths(files, allow_patterns, ignore_patterns)

    total_size = sum(file.size for file in filtered_files)
    return total_size


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
        self.logger = logging.getLogger(__name__)
        self.downloads: dict[str, DownloadState] = {}
        self.process_pool = ProcessPoolExecutor(max_workers=2)
        self.manager = Manager()

    async def start_download(
        self,
        repo_id: str,
        path: str | None,
        websocket: WebSocket,
        allow_patterns: list[str] | None = None,
        ignore_patterns: list[str] | None = None,
    ):
        id = repo_id if path is None else f"{repo_id}/{path}"
        if id in self.downloads:
            self.logger.warning(f"Download already in progress for: {id}")
            await websocket.send_json(
                {"status": "error", "message": "Download already in progress"}
            )
            return

        self.logger.info(f"Starting download for: {id}")
        download_state = DownloadState(repo_id=repo_id, websocket=websocket)
        self.downloads[id] = download_state

        queue = self.manager.Queue()

        # Start the progress updates in a separate thread
        progress_thread = threading.Thread(
            target=self.run_progress_updates, args=(repo_id, path, queue)
        )
        progress_thread.start()

        try:
            await self.download_huggingface_repo(
                repo_id=repo_id,
                path=path,
                allow_patterns=allow_patterns,
                ignore_patterns=ignore_patterns,
                queue=queue,
            )
        except Exception as e:
            self.logger.error(f"Error in download {id}: {e}")
            self.logger.error(traceback.format_exc())
            download_state.status = "error"
            await self.send_update(repo_id, path)
        finally:
            self.logger.info(f"Download process finished: {id}")
            queue.put(None)  # Signal to stop the progress thread
            progress_thread.join()
            del self.downloads[id]

    async def cancel_download(self, id: str):
        if id not in self.downloads:
            return

        self.logger.info(f"Cancelling download for: {id}")
        self.downloads[id].cancel.set()
        self.downloads[id].status = "cancelled"

    def run_progress_updates(self, repo_id: str, path: str | None, queue: Queue):
        asyncio.run(self.send_progress_updates(repo_id, path, queue))

    async def send_update(self, repo_id: str, path: str | None = None):
        id = repo_id if path is None else f"{repo_id}/{path}"
        state = self.downloads[id]
        await state.websocket.send_json(
            {
                "status": state.status,
                "repo_id": state.repo_id,
                "path": path,
                "downloaded_bytes": state.downloaded_bytes,
                "total_bytes": state.total_bytes,
                "downloaded_files": len(state.downloaded_files),
                "current_files": state.current_files,
                "total_files": state.total_files,
            }
        )

    async def send_progress_updates(self, repo_id: str, path: str | None, queue: Queue):
        id = repo_id if path is None else f"{repo_id}/{path}"
        while True:
            try:
                message = queue.get(timeout=0.1)
                if message is None:
                    break
                state = self.downloads[id]
                state.status = "progress"
                state.downloaded_bytes += message["n"]
                await self.send_update(repo_id, path)
            except Empty:
                pass
            except TimeoutError:
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
        path: str | None,
        queue: Queue,
        allow_patterns: list[str] | None = None,
        ignore_patterns: list[str] | None = None,
    ):
        id = repo_id if path is None else f"{repo_id}/{path}"
        state = self.downloads[id]

        self.logger.info(f"Fetching file list for repo: {repo_id}")
        files = self.api.list_repo_tree(repo_id, recursive=True)
        files = [file for file in files if isinstance(file, RepoFile)]
        files = filter_repo_paths(files, allow_patterns, ignore_patterns)

        # Filter out files that already exist in the cache
        files_to_download = []
        for file in files:
            cache_path = try_to_load_from_cache(repo_id, file.path)
            if cache_path is None or not os.path.exists(cache_path):
                files_to_download.append(file)
            else:
                state.downloaded_files.append(file.path)

        state.total_files = len(files_to_download)
        state.total_bytes = sum(file.size for file in files_to_download)
        self.logger.info(
            f"Total files to download: {state.total_files}, Total size: {state.total_bytes} bytes"
        )
        await self.send_update(repo_id, path)

        loop = asyncio.get_running_loop()
        tasks = []
        for file in files_to_download:
            if state.cancel.is_set():
                self.logger.info("Download cancelled")
                break
            state.current_files.append(file.path)
            await self.send_update(repo_id, path)
            task = loop.run_in_executor(
                self.process_pool,
                download_file,
                repo_id,
                file.path,
                queue,
            )
            tasks.append(task)

        completed_tasks = await asyncio.gather(*tasks)
        for filename, local_path in completed_tasks:
            if local_path:
                state.downloaded_files.append(filename)
                self.logger.debug(f"Downloaded file: {filename}")

        state.status = "completed" if not state.cancel.is_set() else "cancelled"
        self.logger.info(f"Download {state.status} for repo: {repo_id}")
        await self.send_update(repo_id, path)


# This will be used to send progress updates to the client
# It will be set only in the sub processes
parent_queue = None


def download_file(repo_id: str, filename: str, queue: Queue):
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
            path = data.get("path")
            allow_patterns = data.get("allow_patterns")
            ignore_patterns = data.get("ignore_patterns")

            if command == "start_download":
                await download_manager.start_download(
                    repo_id=repo_id,
                    path=path,
                    websocket=websocket,
                    allow_patterns=allow_patterns,
                    ignore_patterns=ignore_patterns,
                )
            elif command == "cancel_download":
                await download_manager.cancel_download(data.get("id"))
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
