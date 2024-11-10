from pydantic import Field
from nodetool.metadata.types import (
    AssetRef,
    ChromaCollection,
    ChromaEmbeddingFunction,
    ChromaEmbeddingFunctionEnum,
    TextRef,
)
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import ImageRef


class CollectionNode(BaseNode):
    name: str = Field(
        default="", description="The name of the collection to get or create."
    )
    embedding_function: ChromaEmbeddingFunction = Field(
        default=ChromaEmbeddingFunction()
    )

    async def process(self, context: ProcessingContext) -> ChromaCollection:
        return ChromaCollection(
            name=self.name, embedding_function=self.embedding_function
        )
