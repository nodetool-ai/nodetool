import uuid
from pydantic import Field
from genflow.common.chat import process_messages
from genflow.metadata.types import NodeRef, ThreadMessage, WorkflowRef
from genflow.models.message import Message
from genflow.models.thread import Thread
from genflow.workflows.genflow_node import GenflowNode
from genflow.workflows.processing_context import ProcessingContext


class AgentNode(GenflowNode):
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
        default=5,
        ge=0,
        le=100,
        description="The number of messages to use for the completion.",
    )

    async def process(self, context: ProcessingContext) -> list[ThreadMessage]:
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
            thread_id=thread.id, limit=self.history_length, reverse=True
        )
        messages = [
            Message(
                id="",
                role="system",
                content=self.system_prompt,
            )
        ] + list(reversed(history))

        messages += await process_messages(
            context=context,
            thread_id=thread.id,
            messages=messages,
            workflow_ids=[w.id for w in self.workflows],
            node_types=[n.id for n in self.nodes],
            model="gpt-3.5-turbo",
        )
        return [
            ThreadMessage(
                id=m.id,
                thread_id=m.thread_id,
                role=m.role,
                content=[{"text": m.content}] if m.content else [],  # type: ignore
            )
            for m in messages
            if m.role in ("user", "assistant")
        ]
