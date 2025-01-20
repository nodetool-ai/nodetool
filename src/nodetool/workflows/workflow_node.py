from nodetool.metadata.types import OutputSlot
from nodetool.types.job import JobUpdate
from nodetool.workflows.base_node import BaseNode, type_metadata
from nodetool.workflows.property import Property
from nodetool.workflows.read_graph import read_graph
from nodetool.types.graph import Graph as APIGraph
import json
from nodetool.workflows.run_workflow import run_workflow
from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.common.environment import Environment
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import InputNode, OutputNode
from nodetool.workflows.graph import Graph
from typing import Any, Type

from nodetool.workflows.types import Error, NodeProgress, NodeUpdate


class WorkflowNode(BaseNode):
    """
    A WorkflowNode is a node that can execute a sub-workflow.

    - Load and manage workflow definitions from JSON, including validation of the structure.
    - Generate properties based on input nodes in the workflow, allowing for dynamic input handling.
    - Execute sub-workflows within a larger workflow context, enabling modular workflow design.
    - Handle progress updates, error reporting, and logging during workflow execution to facilitate debugging and monitoring.
    """

    _dynamic = True

    workflow_json: dict = {}

    def load_graph(self):
        edges, nodes = read_graph(self.workflow_json)
        return Graph.from_dict(
            {
                "nodes": [node.model_dump() for node in nodes],
                "edges": [edge.model_dump() for edge in edges],
            }
        )

    def get_api_graph(self) -> APIGraph:
        edges, nodes = read_graph(self.workflow_json)
        return APIGraph(edges=edges, nodes=nodes)

    async def process(self, context: ProcessingContext) -> dict[str, Any]:
        logs = ""

        req = RunJobRequest(
            user_id=context.user_id,
            auth_token=context.auth_token,
            graph=self.get_api_graph(),
            params=self._dynamic_properties,
        )
        output = {}
        async for msg in run_workflow(req, use_thread=True):
            assert "type" in msg
            if msg["type"] == "error":
                raise Exception(msg["error"])
            if msg["type"] == "job_update":
                if msg["status"] == "completed":
                    output = msg["result"] or {}
            if msg["type"] == "node_progress":
                context.post_message(
                    NodeProgress(
                        node_id=self._id,
                        progress=msg["progress"],
                        total=msg["total"],
                        chunk=msg["chunk"],
                    )
                )
            if msg["type"] == "node_update":
                if msg["status"] == "completed":
                    context.post_message(
                        NodeProgress(
                            node_id=self._id,
                            progress=0,
                            total=0,
                            chunk=f"{msg['node_name']} {msg['status']}",
                        )
                    )
        return output
