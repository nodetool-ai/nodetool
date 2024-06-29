import asyncio
from datetime import datetime
import json
from typing import Any, Sequence
from pydantic import Field
from nodetool.api.types.chat import (
    MessageCreateRequest,
    TaskCreateRequest,
)
from nodetool.chat.chat import (
    json_schema_for_column,
    process_messages,
    process_tool_calls,
)
from nodetool.chat.tools import ProcessNodeTool, Tool
from nodetool.metadata.types import (
    ColumnDef,
    DataframeRef,
    FunctionModel,
    NodeRef,
    RecordType,
    Task,
)
from nodetool.providers.openai.prediction import run_openai
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Message


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
            for column in self.columns
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


class CreateTextTaskTool(Tool):
    def __init__(self):
        super().__init__(
            name="create_text_task",
            description="""
            Create a task to be executed by an language model.
            Craft a detailed prompt for the agent to generate the text.
            Use dependent tasks to provide additional context and information.
            """,
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The name of the task. Used to reference the task in dependencies.",
                },
                "instructions": {
                    "type": "string",
                    "description": """
                        Specific instructions for the agent to generate the image.
                        This prompt should be detailed and specific to the task.
                        For example: write a short story about a detective, who is also a cat,
                        solving a mystery in a small town. The story should be engaging,
                        with a twist at the end. The story should be 500 words long.
                    """,
                },
                "dependencies": {
                    "type": "array",
                    "description": """
                        The dependencies of the task. 
                        The dependent tasks will be executed before this task.
                        The output of the dependent tasks will be available to this task.
                    """,
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
        return await context.create_task(
            TaskCreateRequest(
                thread_id=thread_id,
                task_type="image",
                name=params["name"],
                instructions=params["instructions"],
                dependencies=params.get("dependencies", []),
            )
        )


class CreateImageTaskTool(Tool):
    def __init__(self):
        super().__init__(
            name="create_image_task",
            description="""
            Create a task to be executed by an image generation model.
            Craft a detailed prompt for the agent to generate the image.
            Use dependent tasks to provide additional context and information.
            """,
        )
        self.input_schema = {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "The name of the task. Used to reference the task in dependencies.",
                },
                "instructions": {
                    "type": "string",
                    "description": """
                        Specific instructions for the agent to generate the image.
                        This prompt should be detailed and specific to the task.
                        For example: acid lighting, from below, hyperdetailed, hyper realistic,
                        epic action full body portrait Incredible beautiful of Firebird girl 
                        with the merger between gold and fire, hypnotic opinion, fractal hair and 
                        feathers, detailed face | DamShelma | Bayard Wu, Ognjen Sporin, Yann Dalon, 
                        Toni Infante, Amr Elshamy, Viktor Miller-Gausa inquisitive soul 
                        | inspiration | gold colors, intricate detailing, surrealism, fractal details, 
                        enigmatic flirty smile, view from back, dressed in complex chaotic diamond outfit, 
                        artificial nightmares style, reflective eyes, detailed eyes, 
                        detailed art deco ornamentation, 32k
                    """,
                },
                "dependencies": {
                    "type": "array",
                    "description": """
                        The dependencies of the task. 
                        The dependent tasks will be executed before this task.
                        The output of the dependent tasks will be available to this task.
                    """,
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
        return await context.create_task(
            TaskCreateRequest(
                thread_id=thread_id,
                task_type="image",
                name=params["name"],
                instructions=params["instructions"],
                dependencies=params.get("dependencies", []),
            )
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
                role="system",
                content=self.prompt
                + ". Generate records by calling the create_record tool.",
            )
        )
        assert message.thread_id is not None, "Thread ID is required"

        tools = [CreateRecordTool(self.columns.columns)]

        assistant_message = await process_messages(
            context=context,
            thread_id=message.thread_id,
            node_id=self._id,
            model=self.model,
            messages=[message],
            tools=tools,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
            top_k=self.top_k,
            top_p=self.top_p,
        )

        assert assistant_message.tool_calls is not None, "Tool calls missing"

        tool_calls = await process_tool_calls(
            context=context,
            thread_id=message.thread_id,
            tool_calls=assistant_message.tool_calls,
            tools=tools,
        )

        data = [
            [
                (call.result[col.name] if col.name in call.result else None)
                for col in self.columns.columns
            ]
            for call in tool_calls
        ]
        return DataframeRef(columns=self.columns.columns, data=data)


class AgentNode(BaseNode):
    """
    Agent node to plan tasks to achieve a goal.
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
                content="""
                Generate a full list of tasks to achieve the goal below.
                Model the tasks as a directed acyclic graph (DAG) with dependencies.
                Use given tools to create tasks and dependencies.
                These tasks will be executed in order to achieve the goal.
                The output of each task will be available to dependent tasks.
                Tasks will be executed by specialized models and tools.
                Describe each task in detail.
                """,
            ),
            message,
        ]
        assert message.thread_id is not None, "Thread ID is required"

        tools = [CreateImageTaskTool(), CreateTextTaskTool()]

        assistant_message = await process_messages(
            context=context,
            thread_id=message.thread_id,
            node_id=self._id,
            model=self.model,
            messages=input_messages,
            tools=tools,
            top_k=self.top_k,
            top_p=self.top_p,
            max_tokens=self.max_tokens,
            temperature=self.temperature,
        )

        assert assistant_message.tool_calls is not None, "Tool calls missing"

        tool_calls = await process_tool_calls(
            context=context,
            thread_id=message.thread_id,
            tool_calls=assistant_message.tool_calls,
            tools=tools,
        )

        for call in tool_calls:
            print(call)

        return [call.result for call in tool_calls for call in tool_calls]


class ProcessTask(BaseNode):
    """
    Process a task with the given node.
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
    image_nodes: list[NodeRef] = Field(
        default_factory=list,
        description="The image generation nodes to use.",
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
                content="""
                You are a friendly assistant who helps with tasks.
                Generate a response to the task insctructions below.
                Follow the instructions carefully.
                Use the given tools to generate the output.
                Do not make more than one tool call per message.
                """,
            ),
            message,
        ]
        tools = [ProcessNodeTool(node.id) for node in self.image_nodes]

        assistant_message = await process_messages(
            context=context,
            thread_id=message.thread_id,
            node_id=self._id,
            model=self.model,
            tools=tools,
            messages=input_messages,
            temperature=self.temperature,
            top_k=self.top_k,
            top_p=self.top_p,
            max_tokens=self.max_tokens,
        )

        if (
            assistant_message.tool_calls is not None
            and len(assistant_message.tool_calls) > 0
        ):
            tool_calls = await process_tool_calls(
                context=context,
                thread_id=message.thread_id,
                tool_calls=assistant_message.tool_calls,
                tools=tools,
            )
            return tool_calls[0].result["output"]
        else:
            return str(assistant_message.content)
