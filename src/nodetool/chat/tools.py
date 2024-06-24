import json
from pydantic import BaseModel
from nodetool.metadata.types import ChatToolParam, FunctionDefinition
from nodetool.models.workflow import Workflow
from nodetool.workflows.base_node import BaseNode, get_node_class
from nodetool.workflows.graph import Graph
from nodetool.workflows.processing_context import ProcessingContext
from typing import Any

from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.run_workflow import run_workflow


WORKFLOW_PREFIX = "workflow__"


def sanitize_node_name(node_name: str) -> str:
    """
    Sanitize a node name.

    Args:
        node_name (str): The node name.

    Returns:
        str: The sanitized node name.
    """
    return node_name.replace(".", "_")


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

    async def process(
        self, context: ProcessingContext, thread_id: str, params: dict
    ) -> Any:
        raise NotImplementedError()


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

    async def process(
        self, context: ProcessingContext, thread_id: str, params: dict
    ) -> Any:
        node = self.node_type(id="")

        for key, value in params.items():
            node.assign_property(key, value)

        res = await node.process(context)
        out = await node.convert_output(context, res)
        return out


async def function_tool_from_workflow(context: ProcessingContext, workflow_id: str):
    """
    Create a function tool from a workflow.

    Args:
        context (ProcessingContext): The processing context.
        workflow_id (str): The ID of the workflow.

    Returns:
        ChatCompletionToolParam: The chat completion tool parameter.

    Raises:
        ValueError: If the workflow does not exist.
    """

    workflow = await context.get_workflow(workflow_id)

    if workflow is None:
        raise ValueError(f"Workflow {workflow_id} does not exist")

    graph = Graph.from_dict(workflow.graph.model_dump())

    parameters = graph.get_input_schema()

    function_definition = FunctionDefinition(
        name=WORKFLOW_PREFIX + workflow_id,
        description=workflow.description or "",
        parameters=parameters,
    )
    return ChatToolParam(function=function_definition, type="function")


async def process_workflow_function(
    context: ProcessingContext, workflow_id: str, params: dict
) -> Any:
    """
    Process a workflow with the given parameters.
    If the node returns a prediction, wait for the prediction to complete.

    Args:
        context (ProcessingContext): The processing context.
        name (str): The workflow_id
        params (dict): The parameters passed to the workflow.
    """
    workflow = Workflow.get(workflow_id)
    if workflow is None:
        raise ValueError(f"Workflow {workflow_id} does not exist")

    req = RunJobRequest(
        user_id=context.user_id,
        auth_token=context.auth_token,
        graph=workflow.get_api_graph(),
        params=params,
    )

    output = {}

    for msg_json in run_workflow(req):
        msg = json.loads(msg_json)
        if msg["type"] == "node_progress":
            print(f"{msg['node_id']} -> {msg['progress']}\n")
        if msg["type"] == "node_update":
            print(f"{msg['node_name']} -> {msg['status']}\n")
        if msg["type"] == "error":
            raise Exception(msg["error"])
        if msg["type"] == "workflow_update":
            output = msg["result"]

    return {
        k: v.model_dump() if isinstance(v, BaseModel) else v for k, v in output.items()
    }
