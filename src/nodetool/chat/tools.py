import json
from pydantic import BaseModel
from nodetool.metadata.types import ChatToolParam, FunctionDefinition
from nodetool.models.workflow import Workflow
from nodetool.workflows.base_node import BaseNode, get_node_class
from nodetool.workflows.graph import Graph
from nodetool.workflows.processing_context import ProcessingContext
from typing import Any

from nodetool.workflows.run_job_request import RunJobRequest


WORKFLOW_PREFIX = "workflow__"


def sanitize_node_name(node_name: str) -> str:
    """
    Sanitize a node name.

    Args:
        node_name (str): The node name.

    Returns:
        str: The sanitized node name.
    """
    segments = node_name.split(".")
    if len(node_name) > 50:
        return segments[0] + "__" + segments[-1]
    else:
        return "__".join(node_name.split("."))


class Tool:
    name: str
    description: str
    input_schema: Any

    def __init__(self, name: str, description: str):
        self.name = name
        self.description = description

    def tool_param(self) -> ChatToolParam:
        function_definition = FunctionDefinition(
            name=self.name,
            description=self.description,
            parameters=self.input_schema,
        )
        return ChatToolParam(function=function_definition, type="function")

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        return params


class ProcessNodeTool(Tool):
    node_name: str
    node_type: type[BaseNode]

    def __init__(self, node_name: str):
        super().__init__(
            name=sanitize_node_name(node_name),
            description=f"Process node {node_name}",
        )
        self.node_name = node_name
        node_type = get_node_class(self.node_name)
        if node_type is None:
            raise ValueError(f"Node {self.node_name} does not exist")
        self.node_type = node_type
        self.input_schema = self.node_type.get_json_schema()

    async def process(self, context: ProcessingContext, params: dict) -> Any:
        node = self.node_type(id="")

        for key, value in params.items():
            node.assign_property(key, value)

        res = await node.process(context)
        out = await node.convert_output(context, res)
        return out
