from enum import Enum
from pydantic import Field
from nodetool.metadata.types import (
    ChromaEmbeddingFunction,
    ChromaEmbeddingFunctionEnum,
    LlamaModel,
    OpenAIEmbeddingModel,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class SentenceTransformerModel(str, Enum):
    ALL_MINI_LM_L6_V2 = "all-MiniLM-L6-v2"
    ALL_MINI_LM_L12_V2 = "all-MiniLM-L12-v2"
    ALL_MINI_LM_L12_V3 = "all-MiniLM-L12-v3"
    ALL_MINI_LM_L12_V3_HFP = "all-MiniLM-L12-v3-HFP"


class SentenceTransformerEmbeddingFunctionNode(BaseNode):
    model: SentenceTransformerModel = Field(
        default=SentenceTransformerModel.ALL_MINI_LM_L6_V2,
        description="The embedding model to use",
    )

    async def process(self, context: ProcessingContext) -> ChromaEmbeddingFunction:
        return ChromaEmbeddingFunction(
            embedding_function=ChromaEmbeddingFunctionEnum.SENTENCE_TRANSFORMER,
            model=self.model.value,
        )


class OpenCLIPEmbeddingFunctionNode(BaseNode):

    async def process(self, context: ProcessingContext) -> ChromaEmbeddingFunction:
        return ChromaEmbeddingFunction(
            embedding_function=ChromaEmbeddingFunctionEnum.OPENCLIP, model=None
        )


class OllamaEmbeddingFunctionNode(BaseNode):
    model: LlamaModel = Field(title="Model", default=LlamaModel())

    async def process(self, context: ProcessingContext) -> ChromaEmbeddingFunction:
        return ChromaEmbeddingFunction(
            embedding_function=ChromaEmbeddingFunctionEnum.OLLAMA,
            model=self.model.name,
            repo_id=self.model.repo_id,
        )


class OpenAIEmbeddingFunctionNode(BaseNode):
    model: OpenAIEmbeddingModel = Field(
        title="Model", default=OpenAIEmbeddingModel.ADA_002
    )

    async def process(self, context: ProcessingContext) -> ChromaEmbeddingFunction:
        return ChromaEmbeddingFunction(
            embedding_function=ChromaEmbeddingFunctionEnum.OPENAI,
            model=self.model,
        )
