from nodetool.metadata.types import (
    AssetRef,
    ChromaCollection,
    FolderRef,
    ImageRef,
    TextRef,
)
from nodetool.nodes.chroma.chroma_node import ChromaNode
from nodetool.workflows.processing_context import ProcessingContext


import PIL.Image
import numpy as np
from pydantic import Field


class QueryImage(ChromaNode):
    """
    Query the index for similar images.
    """

    collection: ChromaCollection = Field(
        default=ChromaCollection(), description="The collection to query"
    )
    image: ImageRef = Field(default=ImageRef(), description="The image to query")
    n_results: int = Field(default=1, description="The number of results to return")

    async def process(self, context: ProcessingContext) -> list[AssetRef]:
        if not self.image.asset_id and self.image.uri.startswith("file://"):
            raise ValueError("The image needs to be selected")

        collection = self.get_collection(context, self.collection)
        image = await context.image_to_pil(self.image)
        result = collection.query(
            query_images=[np.array(image)], n_results=self.n_results
        )
        ids = [str(id) for id in result["ids"][0]]

        return await self.load_results(context, ids)


# class QueryText(ChromaNode):
#     """
#     Query the index for similar text.
#     """

#     collection: ChromaCollection = Field(
#         default=ChromaCollection(), description="The collection to query"
#     )
#     text: str = Field(default="", description="The text to query")
#     n_results: int = Field(default=1, description="The number of results to return")

#     async def process(self, context: ProcessingContext) -> list[AssetRef]:
#         collection = self.get_or_create_collection(context, self.collection)
#         result = collection.query(query_texts=[self.text], n_results=self.n_results)
#         ids = [str(id) for id in result["ids"][0]]

#         return await self.load_results(context, ids)


class QueryDocuments(ChromaNode):
    """
    Query the index for similar documents and return their content.
    """

    collection: ChromaCollection = Field(
        default=ChromaCollection(), description="The collection to query"
    )
    text: str = Field(default="", description="The text to query")
    n_results: int = Field(default=1, description="The number of results to return")

    @classmethod
    def return_type(cls):
        return {
            "ids": list[str],
            "documents": list[str],
            "metadatas": list[dict],
            "distances": list[float],
        }

    async def process(self, context: ProcessingContext) -> dict:
        if not self.text:
            raise ValueError("The text needs to be provided")

        collection = self.get_collection(context, self.collection)

        result = collection.query(
            query_texts=[self.text],
            n_results=self.n_results,
        )

        assert result["ids"] is not None, "Ids are not returned"
        assert result["documents"] is not None, "Documents are not returned"
        assert result["metadatas"] is not None, "Metadatas are not returned"
        assert result["distances"] is not None, "Distances are not returned"

        return {
            "ids": result["ids"][0],
            "documents": result["documents"][0],
            "metadatas": result["metadatas"][0],
            "distances": result["distances"][0],
        }
