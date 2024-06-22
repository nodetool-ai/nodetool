import asyncio
from datetime import datetime
import json
from typing import Any, Sequence
from pydantic import Field
from nodetool.api.types.chat import (
    MessageCreateRequest,
    TaskCreateRequest,
    TaskUpdateRequest,
)
from nodetool.chat.chat import (
    json_schema_for_column,
    process_messages,
    process_tool_calls,
)
from nodetool.chat.tools import Tool
from nodetool.metadata.types import (
    ColumnDef,
    DataframeRef,
    FunctionModel,
    RecordType,
    Task,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Message


def create_record(
    columns: Sequence[ColumnDef], params: dict[str, Any]
) -> dict[str, Any]:
    """
    Create a record with the given parameters.

    Args:
        context (ProcessingContext): The processing context.
        columns (Sequence[ColumnDef]): The columns of the record.
        params (dict): The parameters of the record.
    """
    properties = {
        column.name: {
            "type": column.data_type,
        }
        for column in columns
    }

    def coerce(key, value):
        if key not in properties:
            raise ValueError(f"Unknown property {key}")
        if properties[key]["type"] == "number":
            return float(value)
        if properties[key]["type"] == "integer":
            return int(value)
        if properties[key]["type"] == "string":
            return str(value)
        if properties[key]["type"] == "datetime":
            return datetime.fromisoformat(value)
        return value

    return {key: coerce(key, value) for key, value in params.items()}


async def create_task(context: ProcessingContext, thread_id: str, params: dict):
    """
    Create a task for an agent to be executed.

    Args:
        context (ProcessingContext): The processing context.
        thread_id (str): The ID of the thread.
        user_id (str): The ID of the user.
        params (dict): The parameters of the task.
    """
    return await context.create_task(
        TaskCreateRequest(
            thread_id=thread_id,
            task_type=params["task_type"],
            name=params["name"],
            instructions=params["instructions"],
            dependencies=params.get("dependencies", []),
        )
    )


class CreateRecordTool(Tool):
    columns: Sequence[ColumnDef]

    def __init__(self, columns: list[ColumnDef]):
        super().__init__(
            name="create_record",
            description="Create a data record.",
        )
        self.columns = columns
        self.input_schema = {
            "type": "object",
            "properties": {
                column.name: json_schema_for_column(column) for column in columns
            },
            "required": [column.name for column in columns],
        }

    async def process(
        self, context: ProcessingContext, thread_id: str, params: dict
    ) -> Any:
        return create_record(self.columns, params)


class CreateTaskTool(Tool):
    def __init__(self):
        super().__init__(
            name="create_task",
            description="Create a task for an agent to be executed.",
        )
        self.input_schema = {
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
        }

    async def process(
        self, context: ProcessingContext, thread_id: str, params: dict
    ) -> Any:
        return await create_task(
            context=context,
            thread_id=thread_id,
            params=params,
        )


class DataframeAgent(BaseNode):
    """
    LLM Agent to create a dataframe based on a user prompt.
    llm, language model, agent, chat, conversation
    """

    model: FunctionModel = Field(
        default=FunctionModel(),
        description="The language model to use.",
    )
    prompt: str = Field(
        default="",
        description="The user prompt",
    )
    max_tokens: int = Field(
        default=1000,
        description="The maximum number of tokens to generate.",
    )
    temperature: float = Field(
        default=0.0,
        description="The temperature to use for sampling.",
    )
    top_k: int = Field(
        default=50,
        description="The number of tokens to sample from.",
    )
    top_p: float = Field(
        default=1.0,
        description="The cumulative probability for sampling.",
    )
    columns: RecordType = Field(
        default=RecordType(),
        description="The columns to use in the dataframe.",
    )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        message = await context.create_message(
            MessageCreateRequest(
                role="user",
                content=self.prompt,
            )
        )
        messages = [
            Message(
                role="system",
                content="Generate records by calling the create_record tool. Supply all fields for each record.",
            ),
            message,
        ]
        assert message.thread_id is not None, "Thread ID is required"

        tools = [CreateRecordTool(self.columns.columns)]

        assistant_message = await process_messages(
            context=context,
            thread_id=message.thread_id,
            model=self.model,
            messages=messages,
            tools=tools,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            top_k=self.top_k,
            top_p=self.top_p,
        )

        tool_calls = await process_tool_calls(
            context=context,
            thread_id=message.thread_id,
            message=assistant_message,
            tools=tools,
        )

        data = [
            [
                (
                    call.function_response[col.name]
                    if col.name in call.function_response
                    else None
                )
                for col in self.columns.columns
            ]
            for call in tool_calls
        ]
        return DataframeRef(columns=self.columns.columns, data=data)


class CreateTaskNode(BaseNode):
    """
    llm, language model, agent, chat, conversation
    """

    model: FunctionModel = Field(
        default=FunctionModel(),
        description="The language model to use.",
    )
    goal: str = Field(
        default="",
        description="The user prompt",
    )

    async def process(self, context: ProcessingContext) -> list[Task]:
        message = await context.create_message(
            MessageCreateRequest(
                role="user",
                content=self.goal,
            )
        )
        input_messages = [
            Message(
                role="system",
                content="Generate a full list of tasks to achieve the goal below. Do not wait for tasks to finish.",
            ),
            message,
        ]
        assert message.thread_id is not None, "Thread ID is required"

        tools = [CreateTaskTool()]

        assistant_message = await process_messages(
            context=context,
            thread_id=message.thread_id,
            model=self.model,
            messages=input_messages,
            tools=tools,
        )

        tool_calls = await process_tool_calls(
            context=context,
            thread_id=message.thread_id,
            message=assistant_message,
            tools=tools,
        )

        return [call.function_response for call in tool_calls for call in tool_calls]


class ProcessTextTask(BaseNode):
    """
    Process a test generation task in a thread.
    llm, language model, agent, chat, conversation
    """

    model: FunctionModel = Field(
        default=FunctionModel(),
        description="The language model to use.",
    )
    task: Task = Field(
        default=Task(),
        description="The task to process.",
    )

    async def process(self, context: ProcessingContext) -> str:
        message = await context.create_message(
            MessageCreateRequest(
                role="user",
                content=self.task.instructions,
            )
        )
        assert message.thread_id is not None, "Thread ID is required"

        input_messages = [
            Message(
                role="system",
                content="Generate a response to the task below.",
            ),
            message,
        ]

        assistant_message = await process_messages(
            context=context,
            thread_id=message.thread_id,
            model=self.model,
            messages=input_messages,
        )

        return str(assistant_message.content)
