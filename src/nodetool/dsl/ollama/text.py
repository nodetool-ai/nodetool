from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.ollama.text

class AggregateEmbeddings(GraphNode):
    """
    Aggregate embeddings into a single vector.

    Use cases:
    - Power semantic search capabilities
    - Enable text clustering and categorization
    - Support recommendation systems
    - Detect semantic anomalies or outliers
    - Measure text diversity or similarity
    - Aid in text classification tasks
    """

    EmbeddingAggregation: typing.ClassVar[type] = nodetool.nodes.ollama.text.AggregateEmbeddings.EmbeddingAggregation
    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description=None)
    chunks: list[str] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='The chunks of text to embed.')
    context_window: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The context window size to use for the model.')
    aggregation: nodetool.nodes.ollama.text.AggregateEmbeddings.EmbeddingAggregation = Field(default=EmbeddingAggregation.MEAN, description='The aggregation method to use for the embeddings.')

    @classmethod
    def get_node_type(cls): return "ollama.text.AggregateEmbeddings"



class Embedding(GraphNode):
    """
    Generate vector representations of text for semantic similarity.
    embeddings, semantic analysis, text similarity, search, clustering

    Use cases:
    - Power semantic search capabilities
    - Enable text clustering and categorization
    - Support recommendation systems
    - Detect semantic anomalies or outliers
    - Measure text diversity or similarity
    - Aid in text classification tasks
    """

    input: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description=None)
    context_window: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The context window size to use for the model.')

    @classmethod
    def get_node_type(cls): return "ollama.text.Embedding"



class Ollama(GraphNode):
    """
    Run Llama models to generate text responses.
    LLM, llama, text generation, language model, ai assistant

    Use cases:
    - Generate creative writing or stories
    - Answer questions or provide explanations
    - Assist with tasks like coding, analysis, or problem-solving
    - Engage in open-ended dialogue on various topics
    """

    model: LlamaModel | GraphNode | tuple[GraphNode, str] = Field(default=LlamaModel(type='llama_model', name='', repo_id='', modified_at='', size=0, digest='', details={}), description='The Llama model to use.')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Prompt to send to the model.')
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description='The image to analyze')
    system_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='You are an assistant.', description='System prompt to send to the model.')
    messages: list[Message] | GraphNode | tuple[GraphNode, str] = Field(default=[], description='History of messages to send to the model.')
    context_window: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The context window size to use for the model.')
    num_predict: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description='The number of tokens to predict.')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='The temperature to use for the model.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The number of highest probability tokens to keep for top-k sampling.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0.95, description='The cumulative probability cutoff for nucleus/top-p sampling.')
    keep_alive: int | GraphNode | tuple[GraphNode, str] = Field(default=300, description='The number of seconds to keep the model alive.')

    @classmethod
    def get_node_type(cls): return "ollama.text.Ollama"


