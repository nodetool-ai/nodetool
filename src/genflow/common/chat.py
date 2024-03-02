import json
from typing import Any
import uuid

from pydantic import BaseModel
from genflow.common.environment import Environment
from genflow.workflows.processing_context import ProcessingContext
from genflow.models.assistant import Assistant
from genflow.models.thread import Thread
from genflow.models.message import Message
from openai.types.shared_params import FunctionDefinition
from openai.types.chat.chat_completion_tool_param import ChatCompletionToolParam

from genflow.workflows.genflow_node import get_node_class


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
        name=sanitize_node_name(node_name),
        description=node_type.get_description(),
        parameters=node_type.get_json_schema(),
    )
    return ChatCompletionToolParam(function=function_definition, type="function")


# def function_tool_from_workflow(workflow_id: str):
#     workflow = Workflow.get(workflow_id)

#     if workflow is None:
#         return None

#     parameters = workflow.get_graph().get_json_schema()

#     function_definition = FunctionDefinition(
#         name=workflow.name,
#         description=workflow.description or "",
#         parameters=parameters,
#     )
#     return ToolAssistantToolsFunction(function=function_definition, type="function")


def default_serializer(obj: Any) -> dict:
    if isinstance(obj, BaseModel):
        return obj.model_dump()
    raise TypeError("Type not serializable")


async def process_node_function(
    context: ProcessingContext, name: str, params: dict
) -> Any:
    """
    Process a node with the given parameters.
    If the node returns a prediction, wait for the prediction to complete.

    Args:
        context (ProcessingContext): The processing context.
        name (str): The sanitizied name of the node.
        params (dict): The parameters passed to the node processing.
    """
    node_type = get_node_class(desanitize_node_name(name))
    if node_type is None:
        raise ValueError(f"Invalid node type {name}")
    node = node_type(**params)

    res = await node.process(context)
    res = await node.convert_output(context, res)
    return res


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
        content=content,
    )
    messages.append(message)

    json_messages = [
        {"role": "system", "content": assistant.instructions},
    ] + [{"role": message.role, "content": message.content} for message in messages]

    assistant.nodes = set(
        [
            "genflow.math.Add",
            "genflow.math.Subtract",
        ]
    )

    completion = await client.chat.completions.create(
        model="gpt-3.5-turbo",
        messages=json_messages,  # type: ignore
        tools=[function_tool_from_node(node_type) for node_type in assistant.nodes],
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
            function_name = tool_call.function.name
            function_args = json.loads(tool_call.function.arguments)
            function_response = await process_node_function(
                context, function_name, function_args
            )
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
