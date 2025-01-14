import asyncio
import threading
import traceback
import click
from nodetool.api.server import create_app, run_uvicorn_server
from nodetool.chat.help import index_documentation, index_examples
from nodetool.common.environment import Environment
import subprocess
import os
from threading import Thread
from typing import IO
import signal
import sys

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

    import comfy.cli_args
    import comfy.model_management
    import comfy.utils
    from nodes import init_extra_nodes

    comfy.cli_args.args.force_fp16 = force_fp16

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
@click.option("--force-fp16", is_flag=True, help="Force FP16.")
@click.option("--reload", is_flag=True, help="Reload the server on changes.")
@click.option(
    "--remote-auth",
    is_flag=True,
    help="Use single local user with id 1 for authentication. Will be ingnored on production.",
)
@click.option("--with-ui", is_flag=True, help="Start Vite development server for UI.")
def serve(
    host: str,
    port: int,
    static_folder: str | None = None,
    reload: bool = False,
    force_fp16: bool = False,
    remote_auth: bool = False,
    worker_url: str | None = None,
    with_ui: bool = False,
):
    """Serve the Nodetool API server."""

    import comfy.cli_args

    comfy.cli_args.args.force_fp16 = force_fp16
    Environment.set_remote_auth(remote_auth)

    if worker_url:
        Environment.set_worker_url(worker_url)

    if Environment.is_production():
        Environment.set_nodetool_api_url(f"https://api.nodetool.ai")
    else:
        Environment.set_nodetool_api_url(f"http://127.0.0.1:{port}")

    if not reload:
        app = create_app(static_folder=static_folder)
    else:
        if static_folder:
            raise Exception("static folder and reload are exclusive options")
        app = "nodetool.api.app:app"

    vite_process = None

    def cleanup(signum, frame):
        if vite_process:
            try:
                log.info("Shutting down Vite development server...")
                if os.name == "nt":  # Windows
                    subprocess.run(
                        ["taskkill", "/F", "/T", "/PID", str(vite_process.pid)]
                    )
                else:  # Unix
                    os.killpg(os.getpgid(vite_process.pid), signal.SIGTERM)
                vite_process.wait(timeout=5)  # Wait up to 5 seconds for clean shutdown
            except Exception as e:
                log.error(f"Error shutting down Vite server: {e}")
                # Force kill if graceful shutdown fails
                try:
                    if os.name == "nt":
                        subprocess.run(
                            ["taskkill", "/F", "/T", "/PID", str(vite_process.pid)]
                        )
                    else:
                        os.killpg(os.getpgid(vite_process.pid), signal.SIGKILL)
                except:
                    pass
            sys.exit(0)

    # Register signal handlers
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    if with_ui:
        web_dir = os.path.join(os.path.dirname(__file__), "..", "..", "web")
        log.info(f"Starting Vite development server in {web_dir}")

        # Determine the npm command based on OS
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

        # Add CREATE_NO_WINDOW flag on Windows to avoid the terminate prompt
        creation_flags = subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0

        # Start process in its own process group
        vite_process = subprocess.Popen(
            [npm_cmd, "run", "start"],
            cwd=web_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=1,
            universal_newlines=True,
            preexec_fn=(None if os.name == "nt" else os.setsid),
            creationflags=creation_flags,  # Add creation flags
        )

        # Start threads to log stdout and stderr
        Thread(
            target=log_stream, args=(vite_process.stdout, "Vite"), daemon=True
        ).start()
        Thread(
            target=log_stream, args=(vite_process.stderr, "Vite Error"), daemon=True
        ).start()

    run_uvicorn_server(app=app, host=host, port=port, reload=reload)


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

if __name__ == "__main__":
    cli()
