from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class GPT2(GraphNode):
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt to send to the model.')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=128, description='Maximum number of tokens to generate. A word is generally 2-3 tokens (minimum: 1)')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='The temperature to use for the model.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    @classmethod
    def get_node_type(cls): return "nodetool.text.generate.GPT2"



class LlamaCpp(GraphNode):
    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', filename='', local_path=None), description='The Llama model to use.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt to send to the model.')
    system_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='You are an assistant.', description='System prompt to send to the model.')
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=128, description='Maximum number of tokens to generate. A word is generally 2-3 tokens (minimum: 1)')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='The temperature to use for the model.')
    n_gpu_layers: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Number of layers to offload to GPU (-ngl). If -1, all layers are offloaded.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    grammar: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The grammar to use for the model. If empty, no grammar is used.')
    is_json_schema: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether the grammar is a JSON schema. If true, the grammar is used as a JSON schema.')
    @classmethod
    def get_node_type(cls): return "nodetool.text.generate.LlamaCpp"


