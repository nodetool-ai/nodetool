import importlib
import dotenv
import os
import typer
import math
import asyncio
from typing import Optional, Literal, TypedDict, Any
from rich.console import Console
from rich.table import Table
from rich import box
import httpx
from datetime import datetime

from nodetool.workflows.base_node import (
    get_recommended_models,
    get_registered_node_classes,
)


dotenv.load_dotenv()

app = typer.Typer()
console = Console()


def format_size(size_bytes: int) -> str:
    """
    Convert bytes to human readable string.
    Uses binary (1024) units.
    """
    if size_bytes == 0:
        return "0 B"

    units = ["B", "KiB", "MiB", "GiB", "TiB", "PiB"]
    exponent = int(math.log(size_bytes, 1024))
    unit = units[min(exponent, len(units) - 1)]
    size = size_bytes / (1024**exponent)

    # Format with up to 2 decimal places, removing trailing zeros
    if size % 1 == 0:
        return f"{int(size)} {unit}"
    return f"{size:.2f}".rstrip("0").rstrip(".") + f" {unit}"


def format_timedelta(dt: datetime) -> str:
    """
    Convert a datetime to a human readable relative time string.
    """
    now = datetime.utcnow()
    diff = now - dt

    seconds = int(diff.total_seconds())
    if seconds < 0:
        return "in the future"

    if seconds < 60:
        return "just now"

    minutes = seconds // 60
    if minutes < 60:
        return f"{minutes}m ago"

    hours = minutes // 60
    if hours < 24:
        return f"{hours}h ago"

    days = hours // 24
    if days < 7:
        return f"{days}d ago"

    if days < 30:
        weeks = days // 7
        return f"{weeks}w ago"

    if days < 365:
        months = days // 30
        return f"{months}mo ago"

    years = days // 365
    if years == 1:
        return "1 year ago"
    return f"{years} years ago"


class JobStatus(TypedDict):
    status: Literal["COMPLETED", "FAILED", "CANCELLED", "IN_PROGRESS", "IN_QUEUE"]
    output: Optional[Any]
    error: Optional[str]


class RunPodClient:
    def __init__(self):
        self.endpoint_id = os.environ.get("MODELS_ENDPOINT_ID")
        self.api_key = os.environ.get("RUNPOD_API_KEY")

        if not self.endpoint_id:
            raise ValueError("MODELS_ENDPOINT_ID environment variable not set")
        if not self.api_key:
            raise ValueError("RUNPOD_API_KEY environment variable not set")

        self.endpoint_url = f"https://api.runpod.ai/v2/{self.endpoint_id}/run"
        self.headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

    async def _start_job(self, input_data: dict) -> str:
        """Start a RunPod job and return the job ID"""
        async with httpx.AsyncClient() as client:
            response = await client.post(
                self.endpoint_url,
                headers=self.headers,
                json={"input": input_data},
                timeout=30.0,
            )

            if response.status_code != 200:
                raise Exception(f"Failed to start job: {response.text}")

            job_data = response.json()
            job_id = job_data.get("id")

            if not job_id:
                raise Exception("No job ID returned from RunPod")

            return job_id

    async def _poll_job(self, job_id: str, poll_interval: float = 2.0) -> Any:
        """Poll a job until it completes or fails"""
        status_url = f"https://api.runpod.ai/v2/{self.endpoint_id}/status/{job_id}"

        async with httpx.AsyncClient() as client:
            while True:
                status_response = await client.get(
                    status_url, headers=self.headers, timeout=30.0
                )

                if status_response.status_code != 200:
                    raise Exception(f"Failed to get job status: {status_response.text}")

                status_data: JobStatus = status_response.json()
                status = status_data.get("status")

                if status == "COMPLETED":
                    return status_data.get("output")
                elif status in ["FAILED", "CANCELLED"]:
                    raise Exception(
                        f"Job {job_id} {status.lower()}: {status_data.get('error')}"
                    )

                await asyncio.sleep(poll_interval)

    async def _execute_job(self, input_data: dict) -> Any:
        """Execute a job and wait for its completion"""
        job_id = await self._start_job(input_data)
        return await self._poll_job(job_id)

    async def download(
        self,
        repo_id: str,
        file_path: str | None = None,
        ignore_patterns: list[str] | None = None,
        allow_patterns: list[str] | None = None,
    ) -> Any:
        input_data = {
            "operation": "download",
            "repo_id": repo_id,
            "file_path": file_path,
            "ignore_patterns": ignore_patterns,
            "allow_patterns": allow_patterns,
        }
        return await self._execute_job(input_data)

    async def scan(self) -> dict:
        input_data = {"operation": "scan"}
        return await self._execute_job(input_data)

    async def delete_model(self, model_id: str) -> dict:
        input_data = {
            "operation": "delete_hf_model",
            "repo_id": model_id,
        }
        return await self._execute_job(input_data)


def create_models_table(cache_info: dict) -> Table:
    table = Table(
        show_header=True,
        header_style="bold magenta",
        box=box.ROUNDED,
        title="Cached Hugging Face Models",
    )

    table.add_column("Model ID", style="cyan")
    table.add_column("Type", style="green")
    table.add_column("Size", justify="right", style="yellow")
    table.add_column("Files", style="blue")

    # Process repos from cache_info
    for repo in cache_info.get("repos", []):
        table.add_row(
            repo["repo_id"],
            repo["repo_type"],
            format_size(repo["size_on_disk"]),
            str(repo["nb_files"]),
        )

    return table


@app.command()
def recommended(
    namespace: str = typer.Argument(..., help="Namespace to download models for")
):
    """Download recommended models from Hugging Face"""
    import nodetool.nodes.anthropic
    import nodetool.nodes.chroma
    import nodetool.nodes.comfy
    import nodetool.nodes.huggingface
    import nodetool.nodes.nodetool
    import nodetool.nodes.openai
    import nodetool.nodes.replicate
    import nodetool.nodes.ollama

    client = RunPodClient()
    node_classes = get_registered_node_classes()
    models = {}
    for node_class in node_classes:
        if node_class.__module__.startswith(f"nodetool.nodes.{namespace}"):
            for model in node_class.get_recommended_models():
                with console.status(f"Downloading {model.repo_id}..."):
                    try:
                        print(
                            asyncio.run(
                                client.download(
                                    model.repo_id,
                                    model.path,
                                    model.ignore_patterns,
                                    model.allow_patterns,
                                )
                            )
                        )
                    except Exception as e:
                        print(e)


@app.command()
def list():
    """List all cached Hugging Face models on the RunPod worker"""
    try:
        with console.status("Fetching cached models..."):
            client = RunPodClient()
            cache_info = asyncio.run(client.scan())

        if not cache_info or not cache_info.get("repos"):
            console.print("No cached models found", style="yellow")
            return

        table = create_models_table(cache_info)
        console.print(table)

        total_size = cache_info.get("size_on_disk", 0)
        console.print(
            f"\nTotal cache size: {format_size(total_size)}", style="bold green"
        )

        if cache_info.get("warnings"):
            console.print("\nWarnings:", style="yellow")
            for warning in cache_info["warnings"]:
                console.print(f"- {warning}", style="yellow")

    except Exception as e:
        console.print(f"Error: {str(e)}", style="bold red")
        raise typer.Exit(1)


@app.command()
def delete(
    model_id: str = typer.Argument(..., help="Model ID to delete"),
):
    """Delete a cached model from the RunPod worker"""
    try:
        with console.status(f"Deleting model {model_id}..."):
            client = RunPodClient()
            result = asyncio.run(client.delete_model(model_id))

            if result.get("success"):
                console.print(f"Successfully deleted {model_id}", style="green")
            else:
                console.print(f"Model {model_id} not found in cache", style="yellow")

    except Exception as e:
        console.print(f"Error: {str(e)}", style="bold red")
        raise typer.Exit(1)


if __name__ == "__main__":
    app()
