from nodetool.common.chroma_client import get_collection
from nodetool.metadata.types import (
    AssetRef,
    Collection,
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

    collection: Collection = Field(
        default=Collection(), description="The collection to query"
    )
    image: ImageRef = Field(default=ImageRef(), description="The image to query")
    n_results: int = Field(default=1, description="The number of results to return")

    @classmethod
    def return_type(cls):
        return {
            "ids": list[str],
            "documents": list[str],
            "metadatas": list[dict],
            "distances": list[float],
        }

    async def process(self, context: ProcessingContext):
        if not self.image.asset_id and not self.image.uri:
            raise ValueError("Image is not connected")

        collection = get_collection(self.collection.name)
        image = await context.image_to_pil(self.image)
        result = collection.query(
            query_images=[np.array(image)], n_results=self.n_results
        )
        assert result["ids"] is not None, "Ids are not returned"
        assert result["documents"] is not None, "Documents are not returned"
        assert result["metadatas"] is not None, "Metadatas are not returned"
        assert result["distances"] is not None, "Distances are not returned"

        ids = [str(id) for id in result["ids"][0]]
        documents = result["documents"][0]
        metadatas = result["metadatas"][0]
        distances = result["distances"][0]

        return {
            "ids": ids,
            "documents": documents,
            "metadatas": metadatas,
            "distances": distances,
        }


class QueryText(ChromaNode):
    """
    Query the index for similar text.
    """

    collection: Collection = Field(
        default=Collection(), description="The collection to query"
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

    async def process(self, context: ProcessingContext):
        collection = get_collection(self.collection.name)
        result = collection.query(query_texts=[self.text], n_results=self.n_results)

        assert result["ids"] is not None, "Ids are not returned"
        assert result["documents"] is not None, "Documents are not returned"
        assert result["metadatas"] is not None, "Metadatas are not returned"
        assert result["distances"] is not None, "Distances are not returned"

        ids = [str(id) for id in result["ids"][0]]
        documents = result["documents"][0]
        metadatas = result["metadatas"][0]
        distances = result["distances"][0]

        return {
            "ids": ids,
            "documents": documents,
            "metadatas": metadatas,
            "distances": distances,
        }
