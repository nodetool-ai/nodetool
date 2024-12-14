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
        if not self.image.asset_id:
            raise ValueError("The image needs to be selected")

        collection = self.get_or_create_collection(context, self.collection)
        image_io = await context.download_asset(self.image.asset_id)
        image = PIL.Image.open(image_io)
        result = collection.query(
            query_images=[np.array(image)], n_results=self.n_results
        )
        ids = [str(id) for id in result["ids"][0]]

        return await self.load_results(context, ids)


class QueryText(ChromaNode):
    """
    Query the index for similar text.
    """

    collection: ChromaCollection = Field(
        default=ChromaCollection(), description="The collection to query"
    )
    text: TextRef = Field(default=TextRef(), description="The text to query")
    n_results: int = Field(default=1, description="The number of results to return")

    async def process(self, context: ProcessingContext) -> list[AssetRef]:
        if not self.text.asset_id:
            raise ValueError("The text needs to be selected")

        collection = self.get_or_create_collection(context, self.collection)
        text_io = await context.download_asset(self.text.asset_id)
        text = text_io.read().decode("utf-8")
        result = collection.query(query_texts=[text], n_results=self.n_results)
        ids = [str(id) for id in result["ids"][0]]

        return await self.load_results(context, ids)
