import asyncio
from sys import stdout
import threading
import time
import click
from genflow.common.environment import Environment
from genflow.workflows.run_job_request import RunJobRequest
import genflow.nodes

log = Environment.get_logger()


def run_workflow(req: RunJobRequest):
    from genflow.workflows.types import Error, WorkflowUpdate
    from genflow.workflows.processing_context import (
        ProcessingContext,
    )
    from genflow.workflows.workflow_runner import WorkflowRunner
    from queue import Queue

    context = ProcessingContext(
        user_id=req.user_id,
        auth_token=req.auth_token,
        workflow_id=req.workflow_id,
        capabilities=["comfy", "db"],
        queue=Queue(),
    )

    loop = asyncio.get_event_loop()
    loop.set_debug(True)
    runner = WorkflowRunner()

    async def run():
        try:
            await runner.run(req, context)
        except Exception as e:
            log.exception(e)
            context.post_message(Error(error=str(e)))

    thread = threading.Thread(target=lambda: asyncio.run(run()))
    thread.start()

    try:
        while runner.is_running():
            if context.has_messages():
                msg = context.pop_message()
                yield msg.model_dump_json() + "\n"
                if isinstance(msg, Error):
                    break
                elif isinstance(msg, WorkflowUpdate):
                    break
            else:
                time.sleep(0.1)

        while context.has_messages():
            msg = context.pop_message()
            yield msg.model_dump_json() + "\n"

        stdout.flush()

    except Exception as e:
        log.exception(e)
        yield Error(error=str(e)).model_dump_json() + "\n"


@click.group()
def cli():
    """A CLI for serving and running workflows."""
    pass


@click.command()
@click.option("--host", default="127.0.0.1", help="Host address to serve on.")
@click.option("--port", default=8000, help="Port to serve on.", type=int)
def serve(reload: bool, host: str, port: int):
    """Serve a web application with optional reload, host, and port."""
    from genflow.api.server import run_uvicorn_server

    Environment.init_dev_env()
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


cli.add_command(serve)
cli.add_command(run)

if __name__ == "__main__":
    cli()
