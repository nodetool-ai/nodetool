from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Embedding(GraphNode):
    input: str | nodetool.metadata.types.TextRef | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', model='', modified_at='', size=0, digest='', details={}), description=None)
    chunk_size: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The size of the chunks to split the input into')
    @classmethod
    def get_node_type(cls): return "ollama.text.Embedding"



class Ollama(GraphNode):
    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', model='', modified_at='', size=0, digest='', details={}), description='The Llama model to use.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt to send to the model.')
    system_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='You are an assistant.', description='System prompt to send to the model.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='The temperature to use for the model.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    @classmethod
    def get_node_type(cls): return "ollama.text.Ollama"


