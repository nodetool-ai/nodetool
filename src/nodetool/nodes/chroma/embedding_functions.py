from pydantic import Field
from nodetool.metadata.types import (
    ChromaEmbeddingFunction,
    ChromaEmbeddingFunctionEnum,
    LlamaModel,
    OpenAIEmbeddingModel,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


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
