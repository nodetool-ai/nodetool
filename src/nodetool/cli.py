import threading
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
        log.info(f"{prefix}: {line.strip()}")


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

    if not reload:
        app = create_app(static_folder=static_folder)
    else:
        if static_folder:
            raise Exception("static folder and reload are exclusive options")
        app = "nodetool.api.app:app"

    vite_process = None

    def cleanup(signum, frame):
        if vite_process:
            log.info("Shutting down Vite development server...")
            vite_process.terminate()
            vite_process.wait()
        sys.exit(0)

    # Register signal handlers
    signal.signal(signal.SIGINT, cleanup)
    signal.signal(signal.SIGTERM, cleanup)

    if with_ui:
        web_dir = os.path.join(os.path.dirname(__file__), "..", "..", "web")
        log.info(f"Starting Vite development server in {web_dir}")

        # Determine the npm command based on OS
        npm_cmd = "npm.cmd" if os.name == "nt" else "npm"

        vite_process = subprocess.Popen(
            [npm_cmd, "run", "start"],
            cwd=web_dir,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            bufsize=1,
            universal_newlines=True,
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
@click.argument("workflow_file", type=click.Path(exists=True))
async def run(workflow_file: str):
    """Run a workflow from a file."""

    # TODO: only import modules referenced in worflow
    import nodetool.nodes.anthropic
    import nodetool.nodes.chroma
    import nodetool.nodes.comfy
    import nodetool.nodes.huggingface
    import nodetool.nodes.nodetool
    import nodetool.nodes.openai
    import nodetool.nodes.replicate
    import nodetool.nodes.ollama
    import nodetool.nodes.luma
    import nodetool.nodes.kling

    from nodetool.workflows.run_workflow import run_workflow
    from nodetool.workflows.run_job_request import RunJobRequest
    from nodetool.workflows.read_graph import read_graph
    from nodetool.types.graph import Graph
    import json

    click.echo(f"Running workflow from {workflow_file}.")

    with open(workflow_file, "r") as f:
        workflow = json.load(f)
        edges, nodes = read_graph(workflow["graph"])

        req = RunJobRequest(
            user_id="1",
            auth_token="token",
            graph=Graph(
                edges=edges,
                nodes=nodes,
            ),
        )
        async for msg in run_workflow(req):
            print(msg, end="")


@click.command()
def chat():
    """Chat with your workflow."""
    import argparse
    import uuid
    import asyncio
    from nodetool.chat.chat import process_messages
    from nodetool.models.thread import Thread
    from nodetool.workflows.processing_context import ProcessingContext
    import argparse

    parser = argparse.ArgumentParser()
    args = parser.parse_args()

    thread = Thread.create(
        user_id="test",
    )

    context = ProcessingContext(
        user_id="test",
        auth_token="",
    )

    while True:
        try:
            user_input = input("> ")
            # reply = asyncio.run(process_messages(context, thread, user_input))
            # print(reply.content)
        except KeyboardInterrupt:
            print("\nExiting...")
            break


cli.add_command(worker)
cli.add_command(serve)
cli.add_command(run)

if __name__ == "__main__":
    cli()
