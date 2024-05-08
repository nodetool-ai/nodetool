import asyncio
import json
from typing import Any, Iterator, Union

from pydantic import BaseModel
from nodetool.common.environment import Environment
from nodetool.metadata.types import FunctionModel, Task, ToolCall
from nodetool.models.task import Task as TaskModel
from nodetool.models.workflow import Workflow
from nodetool.workflows.base_node import get_node_class
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.models.message import Message
from openai.types.shared_params import FunctionDefinition
from openai.types.chat.chat_completion import ChatCompletion
from openai.types.chat.chat_completion_message_param import ChatCompletionMessageParam
from openai._types import NotGiven
from openai.types.chat.chat_completion_message_tool_call import (
    ChatCompletionMessageToolCall,
)
from openai.types.chat.chat_completion_tool_param import ChatCompletionToolParam

from nodetool.workflows.run_job_request import RunJobRequest
from nodetool.workflows.run_workflow import run_workflow


def sanitize_node_name(node_name: str) -> str:
    """
    Sanitize a node name.

    Args:
        node_name (str): The node name.

    Returns:
        str: The sanitized node name.
    """
    return node_name.replace(".", "_")


def desanitize_node_name(node_name: str) -> str:
    """
    Desanitize a node name.

    Args:
        node_name (str): The node name.

    Returns:
        str: The desanitized node name.
    """
    return node_name.replace("_", ".")


NODE_PREFIX = "node__"
WORKFLOW_PREFIX = "workflow__"


def function_tool_from_node(node_name: str):
    """
    Create a function tool from a node definition.

    A node is technically a function, where the parameters are the properties of the node.
    The interface of the function is the JSON schema of the node.

    Args:
        node_name (str): The name of the node.
    """
    node_type = get_node_class(node_name)
    if node_type is None:
        raise ValueError(f"Node {node_name} does not exist")

    function_definition = FunctionDefinition(
        name=NODE_PREFIX + sanitize_node_name(node_name),
        description=node_type.get_description(),
        parameters=node_type.get_json_schema(),
    )
    return ChatCompletionToolParam(function=function_definition, type="function")


def function_tool_from_workflow(workflow_id: str):
    workflow = Workflow.get(workflow_id)

    if workflow is None:
        raise ValueError(f"Workflow {workflow_id} does not exist")

    parameters = workflow.get_graph().get_input_schema()

    function_definition = FunctionDefinition(
        name=WORKFLOW_PREFIX + workflow_id,
        description=workflow.description or "",
        parameters=parameters,
    )
    return ChatCompletionToolParam(function=function_definition, type="function")


def create_task_tool():
    function_definition = FunctionDefinition(
        name="create_task",
        description="Create a task for an agent to be executed.",
        parameters={
            "type": "object",
            "properties": {
                "task_type": {
                    "type": "string",
                    "description": "The type of task. Describes the output of the task. For example, 'generate_text' or 'generate_image'.",
                    "enum": ["generate_text", "generate_image"],
                },
                "name": {
                    "type": "string",
                    "description": "The name of the task.",
                },
                "instructions": {
                    "type": "string",
                    "description": "Specific instructions for the agent to execute. For example, 'Generate a summary of the article.'",
                },
                "dependencies": {
                    "type": "array",
                    "description": "The dependencies of the task. Output of these tasks will be passed as context to the task.",
                    "items": {
                        "type": "string",
                        "description": "The name of the dependent task.",
                    },
                },
            },
        },
    )
    return ChatCompletionToolParam(function=function_definition, type="function")


def default_serializer(obj: Any) -> dict:
    if isinstance(obj, BaseModel):
        return obj.model_dump()
    raise TypeError("Type not serializable")


async def process_node_function(
    context: ProcessingContext, node_type: str, params: dict
):
    """
    Process a node function with the given parameters.

    Args:
        context (ProcessingContext): The processing context.
        node_type (str): The node type.
        params (dict): The parameters passed to the node.
    """
    node_class = get_node_class(node_type)
    if node_class is None:
        raise ValueError(f"Node {node_type} does not exist")

    print(f"Processing node {node_type} with params {params}")

    node = node_class(id="")

    for key, value in params.items():
        node.assign_property(key, value)

    res = await node.process(context)
    out = await node.convert_output(context, res)
    return out


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
    capabilities = ["db"]

    if Environment.get_comfy_folder():
        capabilities.append("comfy")

    output = {}

    for msg_json in run_workflow(req, capabilities):
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


def create_task(thread_id: str, user_id: str, params: dict):
    """
    Create a task for an agent to be executed.

    Args:
        context (ProcessingContext): The processing context.
        params (dict): The parameters of the task.
    """
    task = TaskModel.create(
        thread_id=thread_id,
        user_id=user_id,
        task_type=params["task_type"],
        name=params["name"],
        instructions=params["instructions"],
        dependencies=params.get("dependencies", []),
    )
    return {
        "type": "task",
        "task_type": task.task_type,
        "id": task.id,
        "name": task.name,
        "instructions": task.instructions,
        "dependencies": task.dependencies,
    }


async def create_completion(
    context: ProcessingContext,
    model: FunctionModel,
    messages: list[ChatCompletionMessageParam],
    tools: list[ChatCompletionToolParam],
    **kwargs,
) -> ChatCompletion:
    print(f"Creating completion with model {model.name}")

    if model.name.startswith("gpt"):
        client = Environment.get_openai_client()
        completion = await client.chat.completions.create(
            model=model.name, messages=messages, tools=tools if len(tools) > 0 else NotGiven()  # type: ignore
        )
    else:
        llm = context.load_llama_model(
            name=model.name,
            n_gpu_layers=kwargs.pop("n_gpu_layers", 0),
        )

        completion = ChatCompletion(
            **llm.create_chat_completion(
                messages=messages,  # type: ignore
                tools=tools,  # type: ignore
                **kwargs,
            )
        )

    return completion


async def process_messages(
    context: ProcessingContext,
    thread_id: str,
    messages: list[Message],
    model: FunctionModel,
    workflow_ids: list[str] = [],
    node_types: list[str] = [],
    can_create_tasks: bool = True,
    **kwargs,
) -> tuple[list[Message], list[Task], list[ToolCall]]:
    """
    Process a message in a thread.

    Args:
        context (ProcessingContext): The processing context.
        thread_id (str): The ID of the thread.
        messages (list[Message]): The messages in the thread.
        model (str): The model to use for the completion.
        workflow_ids (list[str]): The workflow IDs to use as tools.
        node_types (list[str]): The node types to use as tools.
    """

    messages_for_request = [
        {"role": str(message.role), "content": str(message.content)}
        for message in messages
    ]

    tasks = []
    tools = []
    messages_to_return = []

    if can_create_tasks:
        tools.append(create_task_tool())
    tools += [function_tool_from_workflow(workflow_id) for workflow_id in workflow_ids]
    tools += [function_tool_from_node(node_type) for node_type in node_types]

    completion = await create_completion(
        context,
        model,
        messages_for_request,  # type: ignore
        tools,
        **kwargs,
    )

    response_message = completion.choices[0].message  # type: ignore
    messages_for_request.append(response_message)  # type: ignore

    messages_to_return.append(
        Message.create(
            thread_id=thread_id,
            user_id=context.user_id,
            role="assistant",
            content=response_message.content,
            tool_calls=(
                [
                    {
                        "function": {
                            "name": c.function.name,
                            "arguments": c.function.arguments,
                        }
                    }
                    for c in response_message.tool_calls
                ]
                if response_message.tool_calls
                else None
            ),
        )
    )

    async def run_tool(tool_call: ChatCompletionMessageToolCall):
        print(f"******* [[TOOL]] {tool_call.function.name} *******")

        function_name = tool_call.function.name.strip()
        function_args = json.loads(tool_call.function.arguments)

        if function_name == "create_task":
            function_response = create_task(thread_id, context.user_id, function_args)
            tasks.append(Task(id=function_response["id"]))
        elif function_name.startswith(WORKFLOW_PREFIX):
            function_response = await process_workflow_function(
                context, function_name[len(WORKFLOW_PREFIX) :], function_args
            )
        elif function_name.startswith(NODE_PREFIX):
            function_response = await process_node_function(
                context,
                desanitize_node_name(function_name[len(NODE_PREFIX) :]),
                function_args,
            )
        else:
            raise ValueError(f"Unknown function type {function_name}")

        content = json.dumps(function_response, default=default_serializer)
        message = Message.create(
            thread_id=thread_id,
            user_id=context.user_id,
            role="tool",
            tool_call_id=tool_call.id,
            name=function_name,
            content=content,
        )
        call = ToolCall(
            function_name=function_name,
            function_args=function_args,
            function_response=function_response,
        )
        return message, call

    if response_message.tool_calls:
        results = await asyncio.gather(
            *[run_tool(tool_call) for tool_call in response_message.tool_calls]
        )
        tool_messages = [result[0] for result in results]
        tool_calls = [result[1] for result in results]
        for tool_message in tool_messages:
            messages_for_request.append(
                {
                    "tool_call_id": tool_message.tool_call_id or "",
                    "role": "tool",
                    "name": tool_message.name,
                    "content": tool_message.content or "",
                }
            )
        second_response = await create_completion(
            context=context,
            model=model,
            messages=messages_for_request,  # type: ignore
            tools=[],
            **kwargs,
        )
        print("SECOND RESPONSE", second_response)
        second_message = second_response.choices[0].message
        messages_to_return.append(
            Message.create(
                thread_id=thread_id,
                user_id=context.user_id,
                role="assistant",
                content=second_message.content,
            )
        )
    else:
        tool_calls = []

    return messages_to_return, tasks, tool_calls
