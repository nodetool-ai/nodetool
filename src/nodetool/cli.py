import click
from nodetool.api.server import run_uvicorn_server
from nodetool.api.server import create_app
from nodetool.common.environment import Environment
import dotenv

# silence warnings on the command line
import warnings

from nodetool.workflows.base_node import get_registered_node_classes

warnings.filterwarnings("ignore")

env_file = dotenv.find_dotenv(usecwd=True)

if env_file != "":
    print(f"Loading environment from {env_file}")
    dotenv.load_dotenv(env_file)

log = Environment.get_logger()


@click.group()
def cli():
    """A CLI for serving and running workflows."""
    pass


@click.command()
def setup():
    """Setup the environment."""
    Environment.setup()


@click.command()
@click.option("--host", default="127.0.0.1", help="Host address to serve on.")
@click.option("--port", default=8000, help="Port to serve on.", type=int)
@click.option(
    "--static-folder",
    default=None,
    help="Path to the static folder to serve.",
    type=click.Path(exists=True, resolve_path=True, file_okay=False, dir_okay=True),
)
@click.option("--skip-setup", is_flag=True, help="Skip the setup process.")
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
    skip_setup: bool = False,
    force_fp16: bool = False,
    remote_auth: bool = False,
):
    """Serve the Nodetool API server."""
    import llama_cpp

    llama_cpp.llama_backend_init()

    if not Environment.has_settings() and not skip_setup:
        print("No settings found. Running setup.")
        Environment.setup()

    if Environment.get_comfy_folder():
        import comfy.cli_args

        comfy.cli_args.args.force_fp16 = force_fp16

    if remote_auth:
        print("Using remote auth.")
    else:
        print("Disable auth.")

    Environment.set_remote_auth(remote_auth)

    app = "nodetool.api.dev_app:app"

    run_uvicorn_server(app=app, host=host, port=port, reload=reload)


@click.command()
@click.argument("workflow_file", type=click.Path(exists=True))
def run(workflow_file: str):
    """Run a workflow from a file."""

    # TODO: only import modules referenced in worflow
    import nodetool.nodes.comfy
    import nodetool.nodes.huggingface
    import nodetool.nodes.nodetool
    import nodetool.nodes.openai
    import nodetool.nodes.replicate

    from nodetool.workflows.run_workflow import run_workflow
    from nodetool.workflows.run_job_request import RunJobRequest
    from nodetool.workflows.read_graph import read_graph
    from nodetool.api.types.graph import Graph
    import json

    click.echo(f"Running workflow from {workflow_file}.")

    capabilities = ["db"]

    if Environment.get_comfy_folder():
        capabilities.append("comfy")

    with open(workflow_file, "r") as f:
        workflow = json.load(f)
        edges, nodes = read_graph(workflow)

        req = RunJobRequest(
            user_id="1",
            auth_token="",
            graph=Graph(
                edges=edges,
                nodes=nodes,
            ),
        )
        for msg in run_workflow(req, capabilities):
            print(msg, end="")


@click.command()
def chat():
    """Chat with your workflow."""
    import argparse
    import uuid
    import asyncio
    from nodetool.common.chat import process_messages
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


cli.add_command(setup)
cli.add_command(serve)
cli.add_command(run)

if __name__ == "__main__":
    cli()
