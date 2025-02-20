from pydantic import BaseModel, Field
import uuid

from nodetool.types.graph import Graph, Node
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.run_workflow import run_workflow


class GraphNode(BaseModel):
    """
    Represents a node in a graph DSL.
    """

    id: str = Field(default_factory=lambda: str(uuid.uuid4()))

    @classmethod
    def set_node_type(cls, node_type: str):
        cls.__annotations__["node_type"] = node_type

    @classmethod
    def get_node_type(cls) -> str:
        return cls.__annotations__["node_type"]


def graph(*nodes):
    """
    Create a graph representation based on the given nodes.

    Args:
      *nodes: Variable number of nodes to be included in the graph.

    Returns:
      Graph: A graph object containing the nodes and edges.

    """
    from nodetool.dsl.graph_node_converter import GraphNodeConverter

    g = GraphNodeConverter()
    for node in nodes:
        g.add(node)
    nodes = [
        Node(
            id=n._id,
            type=n.get_node_type(),
            data=n.model_dump(),
        )
        for n in g.nodes.values()
    ]
    return Graph(nodes=nodes, edges=g.edges)


async def run_graph(graph: Graph, user_id: str = "1", auth_token: str = "token"):
    """
    Run the workflow with the given graph.

    Args:
      graph (Graph): The graph object representing the workflow.

    Returns:
      Any: The result of the workflow execution.
    """
    req = RunJobRequest(user_id=user_id, auth_token=auth_token, graph=graph)

    res = None
    async for msg in run_workflow(req):
        if msg["type"] == "job_update" and msg["status"] == "completed":
            res = msg["result"]
        elif msg["type"] == "job_update" and msg["status"] == "failed":
            raise Exception(msg["error"])
        elif msg["type"] == "error":
            raise Exception(msg["error"])
    return res


async def graph_result(example, return_first_output=True):
    """
    Helper function to run a graph and return its result.

    Args:
        example: The graph example to run
        return_first_output: If True, returns the first output value. If False, returns all outputs.

    Returns:
        The result of running the graph
    """
    result = await run_graph(graph(example))
    assert result is not None, "Result is None"
    if return_first_output:
        first_key = list(result.keys())[0]
        return result[first_key]
    else:
        return result
