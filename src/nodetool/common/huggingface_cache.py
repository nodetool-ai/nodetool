import asyncio
import sys
import json
from typing import Literal
from fastapi import FastAPI, WebSocket
from huggingface_hub import HfApi, hf_hub_download
from huggingface_hub.hf_api import RepoFile
import huggingface_hub.file_download
from multiprocessing import Queue, Manager, freeze_support
from concurrent.futures import ProcessPoolExecutor, ThreadPoolExecutor
import threading


class DownloadManager:
    websocket: WebSocket
    cancel: asyncio.Event
    downloaded_bytes: int = 0
    total_bytes: int = 0
    repo_id: str = ""
    status: Literal["idle"] | Literal["running"]

    def __init__(self):
        self.api = HfApi()
        self.status = "idle"

    async def start_download(
        self,
        repo_id: str,
        websocket: WebSocket,
    ):
        if self.status == "running":
            await websocket.send_json(
                {"status": "error", "message": "Download already in progress"}
            )
            return
        self.process_pool = ProcessPoolExecutor()
        self.manager = Manager()
        self.queue = self.manager.Queue()
        self.status = "running"
        self.cancel = asyncio.Event()
        self.repo_id = repo_id
        self.downloaded_bytes = 0
        self.websocket = websocket

        # Start the progress updates in a separate thread
        self.progress_thread = threading.Thread(target=self.run_progress_updates)
        self.progress_thread.start()

        await self.download_huggingface_repo(repo_id)

    async def cancel_download(self):
        if self.status == "running":
            self.cancel.set()
            return True
        return False

    def run_progress_updates(self):
        asyncio.run(self.send_progress_updates())

    async def send_progress_updates(self):
        while not self.cancel.is_set():
            try:
                message = self.queue.get(timeout=0.1)
                if message:
                    self.downloaded_bytes += message["n"]
                    await self.websocket.send_json(
                        {
                            "status": "progress",
                            "repo_id": self.repo_id,
                            "downloaded_bytes": self.downloaded_bytes,
                            "total_bytes": self.total_bytes,
                        }
                    )
            except Exception:
                pass  # Handle timeout or other exceptions

    async def download_huggingface_repo(self, repo_id):
        files = self.api.list_repo_files(repo_id)
        self.total_files = len(files)
        self.total_bytes = sum(
            file.size
            for file in self.api.list_repo_tree(repo_id, recursive=True)
            if isinstance(file, RepoFile)
        )

        await self.websocket.send_json(
            {
                "status": "start",
                "repo_id": self.repo_id,
                "total_files": self.total_files,
                "total_bytes": self.total_bytes,
            }
        )

        # Remove the progress_task creation and cancellation
        # progress_task = asyncio.create_task(self.send_progress_updates())

        loop = asyncio.get_running_loop()
        downloaded_files = []
        for file in files:
            if self.cancel.is_set():
                break
            filename, local_path = await loop.run_in_executor(
                self.process_pool,
                download_file,
                repo_id,
                file,
                self.queue,
            )
            if local_path:
                downloaded_files.append(filename)

            await self.websocket.send_json(
                {
                    "status": "progress",
                    "repo_id": self.repo_id,
                    "downloaded_bytes": self.downloaded_bytes,
                    "total_bytes": self.total_bytes,
                }
            )

        self.status = "idle"
        self.cancel.set()  # Signal the progress thread to stop
        self.progress_thread.join()  # Wait for the progress thread to finish

        if self.cancel.is_set():
            await self.websocket.send_json(
                {"status": "cancelled", "repo_id": self.repo_id}
            )
        else:
            await self.websocket.send_json(
                {
                    "status": "completed",
                    "repo_id": self.repo_id,
                    "downloaded_files": len(downloaded_files),
                }
            )


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

            if command == "start_download":
                await download_manager.start_download(repo_id, websocket)
            elif command == "cancel_download":
                success = await download_manager.cancel_download()
                await websocket.send_json(
                    {
                        "status": "cancelled" if success else "error",
                        "message": (
                            "Download cancelled" if success else "Download not found"
                        ),
                    }
                )
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
