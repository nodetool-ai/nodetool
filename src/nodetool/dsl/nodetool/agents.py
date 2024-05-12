from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Agent(GraphNode):
    model: FunctionModel | GraphNode | tuple[GraphNode, str] = Field(default=FunctionModel(type='function_model', name='', repo_id='', filename='', local_path=None), description='The language model to use.')
    goal: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user prompt')
    input: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user input')
    n_gpu_layers: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Number of layers on the GPU')
    @classmethod
    def get_node_type(cls): return "nodetool.agents.Agent"



class ImageTask(GraphNode):
    model: FunctionModel | GraphNode | tuple[GraphNode, str] = Field(default=FunctionModel(type='function_model', name='gpt-4-1106-preview', repo_id='', filename='', local_path=None), description='The language model to use.')
    tasks: list[Task] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The tasks to be executed by this agent.')
    nodes: list[NodeRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The nodes to use as tools.')
    @classmethod
    def get_node_type(cls): return "nodetool.agents.ImageTask"



class TaskNode(GraphNode):
    model: FunctionModel | GraphNode | tuple[GraphNode, str] = Field(default=FunctionModel(type='function_model', name='gpt-4-1106-preview', repo_id='', filename='', local_path=None), description='The language model to use.')
    tasks: list[Task] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The tasks to be executed by this agent.')
    nodes: list[NodeRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The nodes to use as tools.')
    @classmethod
    def get_node_type(cls): return "nodetool.agents.Task"



class TextTasks(GraphNode):
    model: FunctionModel | GraphNode | tuple[GraphNode, str] = Field(default=FunctionModel(type='function_model', name='gpt-4-1106-preview', repo_id='', filename='', local_path=None), description='The language model to use.')
    tasks: list[Task] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The tasks to be executed by this agent.')
    nodes: list[NodeRef] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The nodes to use as tools.')
    @classmethod
    def get_node_type(cls): return "nodetool.agents.TextTasks"


