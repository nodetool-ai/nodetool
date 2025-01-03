from pydantic import Field
from nodetool.common.chroma_client import get_collection
from nodetool.metadata.types import (
    Collection,
)
from nodetool.nodes.chroma.chroma_node import ChromaNode
from nodetool.workflows.processing_context import ProcessingContext


class Count(ChromaNode):
    """
    Count the number of documents in a collection.
    """

    collection: Collection = Field(
        default=Collection(), description="The collection to count"
    )

    async def process(self, context: ProcessingContext) -> int:
        collection = get_collection(self.collection.name)
        return collection.count()


class GetDocuments(ChromaNode):
    """
    Get documents from a chroma collection.
    """

    collection: Collection = Field(
        default=Collection(), description="The collection to get"
    )

    ids: list[str] = Field(
        default_factory=list, description="The ids of the documents to get"
    )
    limit: int = Field(default=100, description="The limit of the documents to get")
    offset: int = Field(default=0, description="The offset of the documents to get")

    async def process(self, context: ProcessingContext) -> list[str]:
        collection = get_collection(self.collection.name)
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

    collection: Collection = Field(
        default=Collection(), description="The collection to peek"
    )
    limit: int = Field(default=100, description="The limit of the documents to peek")

    async def process(self, context: ProcessingContext) -> list[str]:
        collection = get_collection(self.collection.name)
        result = collection.peek(limit=self.limit)
        assert result["documents"] is not None
        return result["documents"]
