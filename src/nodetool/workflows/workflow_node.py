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

"""
This module defines the WorkflowNode class, which represents a node in a workflow that can execute a sub-workflow.

The WorkflowNode class extends BaseNode and provides functionality to:
- Load and manage workflow definitions from JSON files
- Generate properties based on input nodes in the workflow
- Execute sub-workflows within a larger workflow context
- Handle progress updates and logging during workflow execution

Key components:
- WorkflowNode: The main class representing a workflow node
- properties_from_input_nodes: Helper function to generate properties from input nodes

The module also includes imports for various dependencies and type definitions used in workflow processing.

This module is part of the nodetool package and integrates with other components
for workflow management, graph processing, and job execution.
"""


def properties_from_input_nodes(nodes: list[BaseNode]):
    return [
        Property(
            name=node.name,
            title=node.name,
            default=node.value,  # type: ignore
            min=node.min if hasattr(node, "min") else None,  # type: ignore
            max=node.max if hasattr(node, "max") else None,  # type: ignore
            type=node.properties_dict()["value"].type,
        )
        for node in nodes
        if isinstance(node, InputNode)
    ]


class WorkflowNode(BaseNode):
    inputs: dict[str, Any] = {}

    def __init__(self, **kwargs):
        id = kwargs.pop("_id", "")
        ui_properties = kwargs.pop("_ui_properties", {})
        super().__init__(id=id, ui_properties=ui_properties)
        self.inputs = kwargs

    def assign_property(self, name: str, value: Any):
        self.inputs[name] = value

    @classmethod
    def get_workflow_file(cls) -> str:
        return ""

    @classmethod
    def read_workflow(cls) -> dict:
        workflow_file = cls.get_workflow_file()
        if workflow_file == "":
            return {}
        if not hasattr(cls, "workflow_json"):
            with open(workflow_file, "r") as f:
                cls.workflow_json = json.load(f)
        return cls.workflow_json

    @classmethod
    def properties(cls):
        graph = cls.load_graph()
        return properties_from_input_nodes(list(graph.nodes))

    @classmethod
    def load_workflow(cls):
        return read_graph(cls.read_workflow())

    @classmethod
    def load_graph(cls):
        edges, nodes = cls.load_workflow()
        return Graph.from_dict(
            {
                "nodes": [node.model_dump() for node in nodes],
                "edges": [edge.model_dump() for edge in edges],
            }
        )

    @classmethod
    def outputs(cls):
        graph = cls.load_graph()
        return [
            OutputSlot(type=type_metadata(output.return_type()), name=output.name)  # type: ignore
            for output in graph.outputs()
        ]

    def get_api_graph(self) -> APIGraph:
        edges, nodes = self.load_workflow()
        return APIGraph(edges=edges, nodes=nodes)

    async def process(self, context: ProcessingContext):
        logs = ""

        req = RunJobRequest(
            user_id=context.user_id,
            auth_token=context.auth_token,
            graph=self.get_api_graph(),
            params=self.inputs or {},
        )
        output = {}
        async for msg in run_workflow(req):
            context.post_message(msg)
            if isinstance(msg, Error):
                raise Exception(msg.error)
            if isinstance(msg, JobUpdate):
                if msg.status == "completed":
                    output = msg.result

        return output
