import typer
import httpx
import asyncio
import websockets
import json
from rich.console import Console
from rich.progress import (
    Progress,
    SpinnerColumn,
    TextColumn,
    BarColumn,
    TaskProgressColumn,
)
from rich.table import Table
from typing import Optional, List
from pathlib import Path
import os

from nodetool.api.model import RepoPath
from nodetool.common.huggingface_models import CachedModel
from nodetool.common.worker_api_client import WorkerAPIClient
from nodetool.metadata.types import HuggingFaceModel

WORKER_URL = os.getenv("WORKER_URL", "http://localhost:5000")

if not WORKER_URL:
    raise ValueError("WORKER_URL is not set")

WS_URL = WORKER_URL.replace("http", "ws")

app = typer.Typer(help="NodeTool Worker CLI")
console = Console()


class WorkerClient:
    def __init__(self, base_url: str, ws_url: str):
        self.base_url = base_url
        self.ws_url = ws_url

    async def try_cache_files(self, paths: list[RepoPath]) -> list[RepoPath]:
        async with httpx.AsyncClient(timeout=300.0) as client:
            response = await client.post(
                f"{self.base_url}/huggingface/try_cache_files",
                json=[path.model_dump() for path in paths],
            )
            response.raise_for_status()
            return [RepoPath.model_validate(path) for path in response.json()]

    async def get_recommended_models(self) -> List[HuggingFaceModel]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(f"{self.base_url}/recommended_models")
            response.raise_for_status()
            return [HuggingFaceModel.model_validate(model) for model in response.json()]

    async def get_installed_models(self) -> List[CachedModel]:
        async with httpx.AsyncClient(timeout=60.0) as client:
            response = await client.get(f"{self.base_url}/huggingface_models")
            response.raise_for_status()
            return [CachedModel.model_validate(model) for model in response.json()]

    async def download_model(self, model_id: str, progress: Progress) -> None:
        task = progress.add_task(f"Downloading {model_id}...", total=100)

        async with websockets.connect(f"{self.ws_url}/download") as websocket:
            await websocket.send(
                json.dumps(
                    {
                        "command": "start_download",
                        "repo_id": model_id,
                        "path": None,
                        "allow_patterns": None,
                        "ignore_patterns": None,
                    }
                )
            )

            while True:
                msg = await websocket.recv()
                data = json.loads(msg)

                if data.get("status") == "progress":
                    if data["total_bytes"] > 0:
                        percentage = (
                            data["downloaded_bytes"] / data["total_bytes"]
                        ) * 100
                        progress.update(task, completed=percentage)
                    if data.get("current_files"):
                        current_file = data["current_files"][-1]
                        progress.update(
                            task, description=f"Downloading {model_id} - {current_file}"
                        )
                elif data.get("status") == "completed":
                    progress.update(task, completed=100)
                    break
                elif data.get("status") in ["error", "cancelled"]:
                    progress.update(
                        task,
                        description=f"[red]Error: {data.get('message', 'Download failed')}",
                    )
                    break


@app.command()
def list_models():
    """List all installed and recommended models"""

    def format_size(size_bytes: float) -> str:
        if size_bytes >= 1024 * 1024 * 1024:
            return f"{size_bytes/(1024*1024*1024):.1f} GB"
        elif size_bytes >= 1024 * 1024:
            return f"{size_bytes/(1024*1024):.1f} MB"
        elif size_bytes >= 1024:
            return f"{size_bytes/1024:.1f} KB"
        return f"{size_bytes:.1f} B"

    async def _list_models():
        worker = WorkerClient(WORKER_URL, WS_URL)
        with console.status("Fetching models..."):
            recommended = await worker.get_recommended_models()
            installed = await worker.get_installed_models()

        installed_ids = {model.repo_id: model for model in installed}
        total_size_mb = sum(model.size_on_disk for model in installed)

        # Create a list of rows with size information for sorting
        table_rows = []
        for model in recommended:
            cached_model = installed_ids.get(model.repo_id)
            status = "[green]Installed" if cached_model else "[yellow]Not Installed"
            size_bytes = cached_model.size_on_disk if cached_model else 0
            size_display = format_size(size_bytes) if cached_model else ""
            table_rows.append(
                {
                    "model_id": model.repo_id,
                    "type": model.type,
                    "path": model.path or "-",
                    "status": status,
                    "size_display": size_display,
                    "size_bytes": size_bytes,
                }
            )

        # Sort rows by size (largest first)
        table_rows.sort(key=lambda x: x["size_bytes"], reverse=True)

        table = Table(show_header=True)
        table.add_column("Model ID")
        table.add_column("Type")
        table.add_column("Path")
        table.add_column("Status")
        table.add_column("Size", justify="right")

        # Add sorted rows to table
        for row in table_rows:
            table.add_row(
                row["model_id"],
                row["type"],
                row["path"],
                row["status"],
                row["size_display"],
            )

        console.print(table)
        console.print(f"\nTotal size of installed models: {format_size(total_size_mb)}")

    asyncio.run(_list_models())


@app.command()
def download_missing():
    """Download all recommended models that are not yet installed"""

    async def _download_missing():
        worker = WorkerClient(WORKER_URL, WS_URL)

        with console.status("Checking models..."):
            recommended = await worker.get_recommended_models()
            installed = await worker.get_installed_models()

        installed_ids = {model.repo_id for model in installed}

        # Split models into those with and without paths
        models_with_paths = [model for model in recommended if model.path is not None]
        models_without_paths = [model for model in recommended if model.path is None]

        # Filter models without paths by installed IDs
        missing_models = [
            model
            for model in models_without_paths
            if model.repo_id not in installed_ids
        ]

        # Check cache for models with specific paths
        if models_with_paths:
            paths_to_check = [
                RepoPath(repo_id=model.repo_id, path=model.path)
                for model in models_with_paths
                if model.path is not None
            ]

            with console.status("Checking cached files..."):
                cached_paths = await worker.try_cache_files(paths_to_check)

            # Get repo_ids of non-cached paths
            cached_repo_ids = {path.repo_id for path in cached_paths}
            missing_path_models = [
                model
                for model in models_with_paths
                if model.repo_id not in cached_repo_ids
            ]
            missing_models.extend(missing_path_models)

        if not missing_models:
            console.print("[green]All recommended models are already installed!")
            return

        console.print(f"Found {len(missing_models)} models to download")

        with Progress(
            SpinnerColumn(),
            TextColumn("[progress.description]{task.description}"),
            BarColumn(),
            TaskProgressColumn(),
        ) as progress:
            for model in missing_models:
                await worker.download_model(model.repo_id, progress)

    asyncio.run(_download_missing())


@app.command()
def send_job(workflow_file: Path):
    """Send a workflow job to the worker"""

    async def _send_job(workflow_file: Path):
        if not workflow_file.exists():
            console.print("[red]Workflow file does not exist!")
            return

        workflow = workflow_file.read_text()

        print(f"Sending workflow to {WS_URL}/predict")

        async with websockets.connect(f"{WS_URL}/predict") as websocket:
            await websocket.send(workflow)

            with Progress(
                SpinnerColumn(),
                TextColumn("[progress.description]{task.description}"),
            ) as progress:
                task = progress.add_task("Processing workflow...")

                while True:
                    msg = await websocket.recv()
                    data = json.loads(msg)

                    if data.get("type") == "progress":
                        progress.update(
                            task, description=data.get("message", "Processing...")
                        )
                    elif data.get("type") == "complete":
                        progress.update(task, description="[green]Complete!")
                        break
                    elif data.get("type") == "error":
                        progress.update(
                            task, description=f"[red]Error: {data.get('error')}"
                        )
                        break

    asyncio.run(_send_job(workflow_file))


@app.command()
def chat(system_prompt: Optional[str] = None):
    """Start a chat session with the worker"""

    async def _chat():
        async with websockets.connect(
            f"{WORKER_URL}/chat",
            ping_interval=20,
            ping_timeout=60,
            close_timeout=10,
        ) as websocket:
            if system_prompt:
                await websocket.send(
                    json.dumps({"type": "system", "content": system_prompt})
                )

            console.print("[blue]Chat session started. Type 'exit' to quit.")

            while True:
                user_input = console.input("[green]You: ")

                if user_input.lower() == "exit":
                    break

                await websocket.send(
                    json.dumps({"type": "user", "content": user_input})
                )
                response = await websocket.recv()
                data = json.loads(response)

                console.print(f"[blue]Assistant: {data.get('content')}")

    asyncio.run(_chat())


if __name__ == "__main__":
    app()
