import json
from typing import Any
import uuid

from pydantic import BaseModel
from genflow.common.environment import Environment
from genflow.models.workflow import Workflow
from genflow.workflows.processing_context import ProcessingContext
from genflow.models.assistant import Assistant
from genflow.models.thread import Thread
from genflow.models.message import Message
from openai.types.shared_params import FunctionDefinition
from openai.types.chat.chat_completion_tool_param import ChatCompletionToolParam

from genflow.workflows.run_job_request import RunJobRequest
from genflow.workflows.run_workflow import run_workflow


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


# def function_tool_from_node(node_name: str):
#     """
#     Create a function tool from a node definition.

#     A node is technically a function, where the parameters are the properties of the node.
#     The interface of the function is the JSON schema of the node.

#     Args:
#         node_name (str): The name of the node.
#     """
#     node_type = get_node_class(node_name)
#     if node_type is None:
#         raise ValueError(f"Node {node_name} does not exist")

#     function_definition = FunctionDefinition(
#         name=sanitize_node_name(node_name),
#         description=node_type.get_description(),
#         parameters=node_type.get_json_schema(),
#     )
#     return ChatCompletionToolParam(function=function_definition, type="function")


def function_tool_from_workflow(workflow_id: str):
    workflow = Workflow.get(workflow_id)

    if workflow is None:
        raise ValueError(f"Workflow {workflow_id} does not exist")

    parameters = workflow.get_graph().get_json_schema()

    function_definition = FunctionDefinition(
        name=workflow.id,
        description=workflow.description or "",
        parameters=parameters,
    )
    return ChatCompletionToolParam(function=function_definition, type="function")


def default_serializer(obj: Any) -> dict:
    if isinstance(obj, BaseModel):
        return obj.model_dump()
    raise TypeError("Type not serializable")


async def process_function(context: ProcessingContext, name: str, params: dict) -> Any:
    """
    Process a workflow with the given parameters.
    If the node returns a prediction, wait for the prediction to complete.

    Args:
        context (ProcessingContext): The processing context.
        name (str): The workflow_id
        params (dict): The parameters passed to the workflow.
    """
    workflow = Workflow.get(name)
    if workflow is None:
        raise ValueError(f"Workflow {name} does not exist")

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


async def process_message(context: ProcessingContext, thread: Thread, content: str):
    """
    Process a message in a thread.

    Args:
        context (ProcessingContext): The processing context.
        thread_id (str): The ID of the thread.
        content (str): The content of the message.
    """

    client = Environment.get_openai_client()

    if thread.assistant_id == "help":
        assistant = Assistant(id="help", instructions="You are the GenFlow assistant.")
    else:
        assistant = Assistant.get(thread.assistant_id)

    if assistant is None:
        raise ValueError(f"Assistant {thread.assistant_id} does not exist")

    messages, _ = Message.paginate(thread_id=thread.id, limit=100)

    message = Message.create(
        id=uuid.uuid4().hex,
        thread_id=thread.id,
        user_id=context.user_id,
        role="user",
        content=str(content),
    )
    messages.append(message)

    json_messages = [
        {"role": "system", "content": assistant.instructions},
    ] + [{"role": message.role, "content": message.content} for message in messages]

    completion = await client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=json_messages,  # type: ignore
        tools=[
            function_tool_from_workflow(workflow_id)
            for workflow_id in assistant.workflows
        ],
    )

    response_message = completion.choices[0].message
    tool_calls = response_message.tool_calls

    Message.create(
        id=uuid.uuid4().hex,
        thread_id=thread.id,
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
                for c in tool_calls
            ]
            if tool_calls
            else None
        ),
    )

    if tool_calls:
        for tool_call in tool_calls:
            print(tool_call)
            function_name = tool_call.function.name
            function_args = json.loads(tool_call.function.arguments)
            function_response = await process_function(
                context, function_name, function_args
            )
            print(function_response)
            content = json.dumps(function_response, default=default_serializer)
            json_messages.append(response_message)  # type: ignore
            json_messages.append(
                {
                    "tool_call_id": tool_call.id,
                    "role": "tool",
                    "name": function_name,
                    "content": content,
                }
            )
        second_response = await client.chat.completions.create(
            model="gpt-3.5-turbo-1106",
            messages=json_messages,  # type: ignore
        )
        second_message = second_response.choices[0].message
        Message.create(
            id=uuid.uuid4().hex,
            thread_id=thread.id,
            user_id=context.user_id,
            role="assistant",
            content=second_message.content,
        )
        return second_message

    return response_message
