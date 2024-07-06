from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class AgentNode(GraphNode):
    model: FunctionModel | GraphNode | tuple[GraphNode, str] = Field(default=FunctionModel(type='function_model', provider=<Provider.Empty: 'empty'>, name='', repo_id='', filename='', local_path=None), description='The language model to use.')
    goal: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user prompt')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description='The maximum number of tokens to generate.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The temperature to use for sampling.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of tokens to sample from.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The cumulative probability for sampling.')
    @classmethod
    def get_node_type(cls): return "nodetool.agents.Agent"



class DataframeAgent(GraphNode):
    model: FunctionModel | GraphNode | tuple[GraphNode, str] = Field(default=FunctionModel(type='function_model', provider=<Provider.Empty: 'empty'>, name='', repo_id='', filename='', local_path=None), description='The language model to use.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The user prompt')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, temp_id=None), description='The image to use in the prompt.')
    tool_name: str | GraphNode | tuple[GraphNode, str] = Field(default='add_row', description='The name of the tool to use.')
    tool_description: str | GraphNode | tuple[GraphNode, str] = Field(default='Adds one row.', description='The description of the tool to use.')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description='The maximum number of tokens to generate.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The temperature to use for sampling.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of tokens to sample from.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The cumulative probability for sampling.')
    columns: RecordType | GraphNode | tuple[GraphNode, str] = Field(default=RecordType(type='record_type', columns=[]), description='The columns to use in the dataframe.')
    @classmethod
    def get_node_type(cls): return "nodetool.agents.DataframeAgent"



class ProcessTask(GraphNode):
    model: FunctionModel | GraphNode | tuple[GraphNode, str] = Field(default=FunctionModel(type='function_model', provider=<Provider.Empty: 'empty'>, name='', repo_id='', filename='', local_path=None), description='The language model to use.')
    task: Task | GraphNode | tuple[GraphNode, str] = Field(default=Task(type='task', id='', task_type='', user_id='', thread_id='', status='', name='', instructions='', dependencies=[], required_capabilities=[], started_at='', finished_at=None, error=None, result=None, cost=None), description='The task to process.')
    image_nodes: list[NodeRef] | GraphNode | tuple[GraphNode, str] = Field(default=PydanticUndefined, description='The image generation nodes to use.')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=1000, description='The maximum number of tokens to generate.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description='The temperature to use for sampling.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of tokens to sample from.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='The cumulative probability for sampling.')
    @classmethod
    def get_node_type(cls): return "nodetool.agents.ProcessTask"


