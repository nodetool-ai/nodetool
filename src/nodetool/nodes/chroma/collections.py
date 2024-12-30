from pydantic import Field
from nodetool.metadata.types import (
    AssetRef,
    ChromaCollection,
    ChromaEmbeddingFunction,
    ChromaEmbeddingFunctionEnum,
    TextRef,
)
from nodetool.nodes.chroma.chroma_node import ChromaNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode
from nodetool.metadata.types import ImageRef


class CollectionNode(ChromaNode):
    name: str = Field(
        default="", description="The name of the collection to get or create."
    )
    embedding_function: ChromaEmbeddingFunction = Field(
        default=ChromaEmbeddingFunction()
    )

    async def process(self, context: ProcessingContext) -> ChromaCollection:
        collection = ChromaCollection(
            name=self.name, embedding_function=self.embedding_function
        )
        self.get_or_create_collection(context, collection)
        return collection


class Count(ChromaNode):
    """
    Count the number of documents in a collection.
    """

    collection: ChromaCollection = Field(
        default=ChromaCollection(), description="The collection to count"
    )

    async def process(self, context: ProcessingContext) -> int:
        collection = self.get_or_create_collection(context, self.collection)
        return collection.count()


class GetDocuments(ChromaNode):
    """
    Get documents from a chroma collection.
    """

    collection: ChromaCollection = Field(
        default=ChromaCollection(), description="The collection to get"
    )

    ids: list[str] = Field(
        default_factory=list, description="The ids of the documents to get"
    )
    limit: int = Field(default=100, description="The limit of the documents to get")
    offset: int = Field(default=0, description="The offset of the documents to get")

    async def process(self, context: ProcessingContext) -> list[str]:
        collection = self.get_collection(context, self.collection)
        result = collection.get(
            ids=self.ids,
            limit=self.limit,
            offset=self.offset,
        )
        assert result["documents"] is not None
        return result["documents"]


class Peek(ChromaNode):
    """
    Peek at the documents in a collection.
    """

    collection: ChromaCollection = Field(
        default=ChromaCollection(), description="The collection to peek"
    )
    limit: int = Field(default=100, description="The limit of the documents to peek")

    async def process(self, context: ProcessingContext) -> list[str]:
        collection = self.get_collection(context, self.collection)
        result = collection.peek(limit=self.limit)
        assert result["documents"] is not None
        return result["documents"]
