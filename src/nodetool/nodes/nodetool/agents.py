import asyncio
import json
from pydantic import Field
from nodetool.api.types.chat import MessageCreateRequest
from nodetool.common.chat import process_messages
from nodetool.metadata.types import (
    FunctionModel,
    ImageRef,
    NodeRef,
    Task,
    ToolCall,
)
from nodetool.models.task import Task as TaskModel
from nodetool.metadata.types import GPTModel
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import Message


class Agent(BaseNode):
    """
    LLM Agent with access to workflows and nodes.
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
    n_gpu_layers: int = Field(default=0, description="Number of layers on the GPU")

    @classmethod
    def return_type(cls):
        return {
            "messages": list[Message],
            "tasks": list[Task],
            "thread_id": str,
        }

    async def process(self, context: ProcessingContext):
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

        messages, tasks, _ = await process_messages(
            context=context,
            thread_id=message.thread_id,
            model=self.model,
            messages=input_messages,
            n_gpu_layers=self.n_gpu_layers,
        )
        return {
            "messages": messages,
            "tasks": tasks,
            "thread_id": message.thread_id,
        }


class TaskNode(BaseNode):
    """
    LLM Task agent with access to workflows and nodes.
    llm, language model, agent, chat, conversation
    """

    model: FunctionModel = Field(
        default=FunctionModel(name=GPTModel.GPT4.value),
        description="The language model to use.",
    )
    thread_id: str = Field(
        default="",
        description="The thread ID of the conversation.",
    )
    tasks: list[Task] = Field(
        default=[],
        description="The tasks to be executed by this agent.",
    )
    # workflows: list[WorkflowRef] = Field(
    #     default=[],
    #     description="The workflows to to use as tools.",
    # )
    nodes: list[NodeRef] = Field(
        default=[],
        description="The nodes to use as tools.",
    )

    def get_system_prompt(self):
        raise NotImplementedError

    async def process_task(
        self, context: ProcessingContext, task: TaskModel, **kwargs
    ) -> tuple[list[Message], list[ToolCall]]:
        messages, _, tool_calls = await process_messages(
            context=context,
            model_name=self.model.name,
            thread_id=self.thread_id,
            can_create_tasks=False,
            # workflow_ids=[w.id for w in self.workflows],
            node_types=[n.id for n in self.nodes],
            messages=[
                Message(
                    id="",
                    role="system",
                    content=self.get_system_prompt(),
                ),
                Message(
                    id="",
                    role="user",
                    content=task.instructions,
                ),
            ],
            model=self.model,
            **kwargs,
        )

        return messages, tool_calls


class TextTasks(TaskNode):
    """
    LLM Text Task agent with access to workflows and nodes.
    llm, language model, agent, chat, conversation
    """

    @classmethod
    def return_type(cls):
        return {
            "texts": list[str],
            "messages": list[Message],
        }

    def get_system_prompt(self):
        return "Generate text based on the instructions below."

    async def process(self, context: ProcessingContext):
        async def process_task(task: Task):
            t = TaskModel.find(context.user_id, task.id)
            if t and t.task_type == "generate_text":
                messages, tool_calls = await self.process_task(context, t)
                if len(tool_calls) > 0:
                    res = tool_calls[-1].function_response
                    t.result = res["output"]
                    t.save()
                else:
                    t.result = messages[-1].content
                    t.save()
                return messages, t.result or ""
            else:
                return [], ""

        res = await asyncio.gather(*[process_task(task) for task in self.tasks])
        return {
            "texts": [r[1] for r in res],
            "messages": [m for r in res for m in r[0]],
        }


class ImageTask(TaskNode):
    """
    LLM Image Task agent with access to workflows and nodes.
    llm, language model, agent, chat, conversation
    """

    @classmethod
    def return_type(cls):
        return {
            "images": list[ImageRef],
            "messages": list[Message],
        }

    def get_system_prompt(self):
        return """
        Follow the instructions below.
        Use tools to generate images.
        Perform exactly one tool call.
        """

    async def process(self, context: ProcessingContext):
        async def process_task(task: Task):
            try:
                t = TaskModel.find(context.user_id, task.id)
                if t and t.task_type == "generate_image":
                    messages, tool_calls = await self.process_task(context, t)
                    res = tool_calls[-1].function_response
                    assert isinstance(res, dict)
                    assert "output" in res
                    if isinstance(res["output"], ImageRef):
                        t.result = res["output"].model_dump_json()
                        t.save()
                        return messages, res["output"]
                    else:
                        t.result = json.dumps(res["output"])
                        t.save()
                        return messages, ImageRef(**res["output"])
                else:
                    return [], ImageRef()
            except Exception as e:
                print(e)
                return [], ImageRef()

        res = await asyncio.gather(*[process_task(task) for task in self.tasks])

        return {
            "images": [r[1] for r in res],
            "messages": [m for r in res for m in r[0]],
        }
