import click
from genflow.common.environment import Environment
from genflow.workflows.run_workflow import run_workflow
from genflow.workflows.run_job_request import RunJobRequest

# silence warnings on the command line
import warnings

warnings.filterwarnings("ignore")


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
    """Serve a web application with optional reload, host, and port."""
    from genflow.api.server import run_uvicorn_server

    if not Environment.is_production():
        if not Environment.has_settings():
            print("No settings found. Running setup.")
            Environment.setup()
        Environment.init_comfy()

    run_uvicorn_server(host, port)


@click.command()
@click.argument("workflow_file", type=click.Path(exists=True))
def run(workflow_file: str):
    """Run a workflow from a file."""
    from genflow.workflows.read_graph import read_graph
    from genflow.api.models.graph import Graph
    import json

    click.echo(f"Running workflow from {workflow_file}.")
    Environment.init_dev_env()

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
