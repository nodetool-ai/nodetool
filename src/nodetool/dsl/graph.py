import json
from pydantic import BaseModel, Field
import uuid

from nodetool.api.types.graph import Graph, Node
from nodetool.common.environment import Environment
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


def run(graph: Graph):
    """
    Run the workflow with the given graph.

    Args:
      graph (Graph): The graph object representing the workflow.

    Returns:
      Any: The result of the workflow execution.
    """
    capabilities = ["db"]

    if Environment.get_comfy_folder():
        capabilities.append("comfy")

    req = RunJobRequest(user_id="1", auth_token="", graph=graph)

    res = None
    for str_msg in run_workflow(req, capabilities):
        msg = json.loads(str_msg)
        if msg["type"] == "workflow_update":
            res = msg["result"]
    return res
