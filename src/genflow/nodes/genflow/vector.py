from typing import Any, Literal
from pydantic import Field
from genflow.metadata.types import Tensor
from genflow.metadata.types import TextRef
from genflow.common.environment import Environment
from genflow.workflows.processing_context import ProcessingContext
from genflow.metadata.types import DataFrame
from genflow.workflows.genflow_node import GenflowNode
from genflow.metadata.types import OutputType


class AddVector(GenflowNode):
    """ """

    index_name: str = Field(
        default="", description="The name of the index to add the vector to"
    )

    document_id: str = Field(
        default="", description="The document id to add the vector to"
    )

    document: str | TextRef = Field(
        default="", description="The document to add to the vector store"
    )

    embedding: Tensor = Field(
        default=Tensor(), description="The embedding to add to the vector store"
    )

    async def process(self, context: ProcessingContext):
        client = Environment.get_chroma_client()
        emb = self.embedding.value
        doc = await context.to_str(self.document)

        collection = client.get_or_create_collection(self.index_name)
        collection.upsert(ids=self.document_id, embeddings=emb, documents=doc)


class QueryResult(OutputType):
    ids: list[str] = Field(
        default=[], description="The ids of the documents returned by the query"
    )
    documents: list[str] = Field(
        default=[], description="The documents returned by the query"
    )
    embeddings: list[Tensor] = Field(
        default=[], description="The embeddings returned by the query"
    )


class QueryVector(GenflowNode):
    """ """

    index_name: str = Field(default="", description="The name of the index to query")

    embedding: Tensor = Field(default=Tensor(), description="The embedding to query")

    n_results: int = Field(default=1, description="The number of results to return")

    async def process(self, context: ProcessingContext) -> QueryResult:
        client = Environment.get_chroma_client()
        emb = self.embedding.value

        collection = client.get_or_create_collection(self.index_name)
        result = collection.query(emb)

        return QueryResult(
            ids=result["ids"][0],
            documents=result["documents"][0] if result["documents"] else [],
            embeddings=(
                [Tensor(value=t) for t in result["embeddings"][0]]  # type: ignore
                if result["embeddings"]
                else []
            ),
        )
