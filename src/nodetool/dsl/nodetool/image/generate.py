from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class StableDiffusion(GraphNode):
    inputs: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.image.generate.StableDiffusion"



class WorkflowNode(GraphNode):
    inputs: dict[str, Any] | GraphNode | tuple[GraphNode, str] = Field(default={}, description=None)
    @classmethod
    def get_node_type(cls): return "nodetool.workflows.workflow_node.Workflow"


