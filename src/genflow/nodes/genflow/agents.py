from pydantic import Field
from genflow.metadata.types import NodeRef, WorkflowRef
from genflow.workflows.genflow_node import GenflowNode


class AgentNode(GenflowNode):
    name: str = Field(
        default="",
        description="The name of the assistant.",
    )
    description: str = Field(
        default="",
        description="The description of the assistant.",
    )
    instructions: str = Field(
        default="",
        description="The system prompt",
    )
    workflows: list[WorkflowRef] = Field(
        default=[],
        description="The workflows to to use as tools.",
    )
    nodes: list[NodeRef] = Field(
        default=[],
        description="The nodes to use as tools.",
    )
