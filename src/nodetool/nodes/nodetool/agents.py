import json
import uuid
from pydantic import Field
from nodetool.common.chat import process_messages
from nodetool.metadata.types import NodeRef, Task, ThreadMessage, WorkflowRef
from nodetool.models.message import Message
from nodetool.models.task import Task as TaskModel
from nodetool.nodes.openai import GPTModel
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class AgentNode(BaseNode):
    """
    LLM Agent with access to workflows and nodes.
    llm, language model, agent, chat, conversation
    """

    model: GPTModel = Field(
        default=GPTModel.GPT3,
        description="The language model to use.",
    )
    system_prompt: str = Field(
        default="You are a helpful assistant.",
        description="The system prompt",
    )
    prompt: str = Field(
        default="",
        description="The user prompt",
    )
    workflows: list[WorkflowRef] = Field(
        default=[],
        description="The workflows to to use as tools.",
    )
    nodes: list[NodeRef] = Field(
        default=[],
        description="The nodes to use as tools.",
    )
    new_thread: bool = Field(
        default=False,
        description="Whether to start a new thread.",
    )
    history_length: int = Field(
        default=20,
        ge=0,
        le=100,
        description="The number of messages to use for the completion.",
    )

    @classmethod
    def return_type(cls):
        return {
            "messages": list[ThreadMessage],
            "tasks": list[Task],
        }

    async def process(self, context: ProcessingContext):
        if self.new_thread:
            thread = context.create_thread()
        else:
            thread = context.get_latest_thread()

        await context.create_message(
            thread_id=thread.id,
            role="user",
            content=self.prompt,
        )
        history, _ = await context.get_messages(
            thread_id=thread.id,
            limit=self.history_length,
        )
        history = list(reversed(history))
        messages, tasks = await process_messages(
            context=context,
            thread_id=thread.id,
            messages=[
                Message(
                    id="",
                    role="system",
                    content=self.system_prompt,
                )
            ]
            + history,
            workflow_ids=[w.id for w in self.workflows],
            node_types=[n.id for n in self.nodes],
            model=self.model,
        )
        return {
            "messages": [
                ThreadMessage(
                    id=m.id,
                    thread_id=m.thread_id,
                    role=m.role,
                    content=[{"text": m.content}] if m.content else [],  # type: ignore
                )
                for m in history + messages
            ],
            "tasks": tasks,
        }


class TaskNode(BaseNode):
    """
    LLM Task agent with access to workflows and nodes.
    llm, language model, agent, chat, conversation
    """

    model: GPTModel = Field(
        default=GPTModel.GPT3,
        description="The language model to use.",
    )
    system_prompt: str = Field(
        default="You are a helpful assistant.",
        description="The system prompt",
    )
    prompt_template: str = Field(
        default="Please complete the task: {task_name}. Follow these instructions: {task_instructions}.",
        description="The prompt template",
    )
    task: Task = Field(
        default=[],
        description="The task to be executed by this agent.",
    )
    history_length: int = Field(
        default=20,
        ge=0,
        le=100,
        description="The number of messages to use for the completion.",
    )

    @classmethod
    def return_type(cls):
        return {
            "messages": list[ThreadMessage],
            "tasks": list[Task],
        }

    async def process(self, context: ProcessingContext):
        thread = context.get_latest_thread()

        history, _ = await context.get_messages(
            thread_id=thread.id,
            limit=self.history_length,
        )
        task = TaskModel.find(context.user_id, self.task.id)
        if task is None:
            raise ValueError(f"Task {self.task.id} not found.")

        prompt = self.prompt_template.format(
            task_name=task.name,
            task_instructions=task.instructions,
        )

        messages, _ = await process_messages(
            context=context,
            thread_id=thread.id,
            can_create_tasks=False,
            messages=[
                Message(
                    id="",
                    role="system",
                    content=self.system_prompt,
                ),
                Message(
                    id="",
                    role="user",
                    content=prompt,
                ),
            ],
            model=self.model,
        )
        return [
            ThreadMessage(
                id=m.id,
                thread_id=m.thread_id,
                role=m.role,
                content=[{"text": m.content}] if m.content else [],  # type: ignore
            )
            for m in history + messages
        ]
