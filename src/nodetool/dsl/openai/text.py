from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

import nodetool.nodes.openai.text

class Embedding(GraphNode):
    """
    Generate vector representations of text for semantic analysis.
    embeddings, similarity, search, clustering, classification

    Uses OpenAI's embedding models to create dense vector representations of text.
    These vectors capture semantic meaning, enabling:
    - Semantic search
    - Text clustering
    - Document classification
    - Recommendation systems
    - Anomaly detection
    - Measuring text similarity and diversity
    """

    EmbeddingModel: typing.ClassVar[type] = nodetool.nodes.openai.text.Embedding.EmbeddingModel
    input: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    model: nodetool.nodes.openai.text.Embedding.EmbeddingModel = Field(default=EmbeddingModel.TEXT_EMBEDDING_3_SMALL, description=None)
    chunk_size: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description=None)

    @classmethod
    def get_node_type(cls): return "openai.text.Embedding"



class OpenAIText(GraphNode):
    """
    Generate natural language responses using OpenAI models.
    llm, text-generation, chatbot, question-answering

    Leverages OpenAI's GPT models to:
    - Generate human-like text responses
    - Answer questions
    - Complete prompts
    - Engage in conversational interactions
    - Assist with writing and editing tasks
    - Perform text analysis and summarization
    """

    model: OpenAIModel | GraphNode | tuple[GraphNode, str] = Field(default=OpenAIModel(type='openai_model', id='o3-mini', object='', created=0, owned_by=''), description=None)
    system: str | GraphNode | tuple[GraphNode, str] = Field(default='You are a friendly assistant.', description=None)
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description=None)
    messages: list[Message] | GraphNode | tuple[GraphNode, str] = Field(default=[], description=None)
    image: ImageRef | GraphNode | tuple[GraphNode, str] = Field(default=ImageRef(type='image', uri='', asset_id=None, data=None), description=None)
    presence_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    frequency_penalty: float | GraphNode | tuple[GraphNode, str] = Field(default=0.0, description=None)
    max_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=4096, description=None)
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description=None)

    @classmethod
    def get_node_type(cls): return "openai.text.OpenAIText"


