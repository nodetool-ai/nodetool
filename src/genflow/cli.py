import click
from genflow.common.environment import Environment
import dotenv

# silence warnings on the command line
import warnings

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
def serve(host: str, port: int):
    """Serve the GenFlow API server."""

    from genflow.api.server import run_uvicorn_server
    from genflow.api.server import create_app

    if not Environment.is_production():
        if not Environment.has_settings():
            print("No settings found. Running setup.")
            Environment.setup()
        Environment.init_comfy()

    app = create_app()

    run_uvicorn_server(app, host, port)


@click.command()
@click.argument("workflow_file", type=click.Path(exists=True))
def run(workflow_file: str):
    """Run a workflow from a file."""

    from genflow.workflows.run_workflow import run_workflow
    from genflow.workflows.run_job_request import RunJobRequest
    from genflow.workflows.read_graph import read_graph
    from genflow.api.models.graph import Graph
    import json

    click.echo(f"Running workflow from {workflow_file}.")
    Environment.init_comfy()

    with open(workflow_file, "r") as f:
        workflow = json.load(f)
        edges, nodes = read_graph(workflow)

        req = RunJobRequest(
            user_id="",
            auth_token="",
            graph=Graph(
                edges=edges,
                nodes=nodes,
            ),
        )
        for msg in run_workflow(req):
            print(msg, end="")


cli.add_command(setup)
cli.add_command(serve)
cli.add_command(run)

if __name__ == "__main__":
    cli()
