import asyncio
import traceback
import click
from nodetool.api.server import create_app, run_uvicorn_server
from nodetool.common.environment import Environment
from typing import IO

# silence warnings on the command line
import warnings

from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.run_workflow import run_workflow

warnings.filterwarnings("ignore")
log = Environment.get_logger()


@click.group()
def cli():
    """A CLI for serving and running workflows."""
    pass


@click.command()
@click.option("--host", default="127.0.0.1", help="Host address to serve on.")
@click.option("--port", default=8001, help="Port to serve on.", type=int)
@click.option("--force-fp16", is_flag=True, help="Force FP16.")
@click.option("--reload", is_flag=True, help="Reload the server on changes.")
def worker(
    host: str,
    port: int,
    reload: bool = False,
    force_fp16: bool = False,
):
    """Serve the Nodetool API server."""

    try:
        import comfy.cli_args  # type: ignore
        import comfy.model_management  # type: ignore
        import comfy.utils  # type: ignore
        from nodes import init_extra_nodes  # type: ignore

        comfy.cli_args.args.force_fp16 = force_fp16
    except ImportError:
        pass

    app = "nodetool.api.worker:app"

    init_extra_nodes()
    run_uvicorn_server(app=app, host=host, port=port, reload=reload)


def log_stream(stream: IO[bytes], prefix: str):
    """Log output from a stream with a prefix."""
    for line in iter(stream.readline, b""):
        stripped_line = line.strip()
        if stripped_line:  # Only log non-empty lines
            log.info(f"{prefix}: {stripped_line}")


@click.command()
@click.option("--host", default="127.0.0.1", help="Host address to serve on.")
@click.option("--port", default=8000, help="Port to serve on.", type=int)
@click.option("--worker-url", default=None, help="URL of the worker to connect to.")
@click.option(
    "--static-folder",
    default=None,
    help="Path to the static folder to serve.",
    type=click.Path(exists=True, resolve_path=True, file_okay=False, dir_okay=True),
)
@click.option("--apps-folder", default=None, help="Path to the apps folder.")
@click.option("--force-fp16", is_flag=True, help="Force FP16.")
@click.option("--reload", is_flag=True, help="Reload the server on changes.")
@click.option(
    "--remote-auth",
    is_flag=True,
    help="Use single local user with id 1 for authentication. Will be ingnored on production.",
)
def serve(
    host: str,
    port: int,
    static_folder: str | None = None,
    reload: bool = False,
    force_fp16: bool = False,
    remote_auth: bool = False,
    worker_url: str | None = None,
    apps_folder: str | None = None,
):
    """Serve the Nodetool API server."""

    try:
        import comfy.cli_args  # type: ignore

        comfy.cli_args.args.force_fp16 = force_fp16
    except ImportError:
        pass

    Environment.set_remote_auth(remote_auth)

    if worker_url:
        Environment.set_worker_url(worker_url)

    if Environment.is_production():
        Environment.set_nodetool_api_url(f"https://api.nodetool.ai")
    else:
        Environment.set_nodetool_api_url(f"http://127.0.0.1:{port}")

    if not reload:
        app = create_app(static_folder=static_folder, apps_folder=apps_folder)
    else:
        if static_folder:
            raise Exception("static folder and reload are exclusive options")
        if apps_folder:
            raise Exception("apps folder and reload are exclusive options")
        app = "nodetool.api.app:app"

    run_uvicorn_server(app=app, host=host, port=port, reload=reload)


@click.command()
def chat():
    """Start the chat."""
    from nodetool.chat.chat import chat_cli

    asyncio.run(chat_cli())


@click.command()
@click.argument("workflow_id", type=str)
def run(workflow_id: str):
    """Run a workflow from a file."""
    request = RunJobRequest(
        workflow_id=workflow_id, user_id="1", auth_token="local_token"
    )

    async def run_workflow_async():
        async for message in run_workflow(request):
            print("Running workflow...")
            try:
                async for message in run_workflow(request):
                    # Print message type and content
                    if hasattr(message, "type"):
                        print(f"{message.type}: {message.model_dump_json()}")
                    else:
                        print(message)
                print("Workflow finished")
            except Exception as e:
                print(f"Error running workflow: {e}")
                traceback.print_exc()
                exit(1)

    asyncio.run(run_workflow_async())


cli.add_command(worker)
cli.add_command(serve)
cli.add_command(run)
cli.add_command(chat)

if __name__ == "__main__":
    cli()
