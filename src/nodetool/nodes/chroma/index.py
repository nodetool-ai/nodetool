from nodetool.metadata.types import ChromaCollection, FolderRef, ImageRef, TextRef
from nodetool.nodes.chroma import MAX_INDEX_SIZE
from nodetool.nodes.chroma.chroma_node import ChromaNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.types import NodeProgress

import PIL.Image
import numpy as np
from pydantic import Field
from typing import List


import PIL.Image
import numpy as np
from pydantic import Field


class IndexFolder(ChromaNode):
    """
    Index all the assets in a folder.
    """

    @classmethod
    def is_cacheable(cls):
        return False

    collection: ChromaCollection = Field(
        default=ChromaCollection(), description="The collection to index"
    )
    folder: FolderRef = Field(default=FolderRef(), description="The folder to index")

    async def process(self, context: ProcessingContext) -> FolderRef:
        if self.folder.is_empty():
            raise ValueError("The folder needs to be selected")

        collection = self.get_or_create_collection(context, self.collection)

        asset_list = await context.paginate_assets(self.folder.asset_id, MAX_INDEX_SIZE)
        total = len(asset_list.assets)
        context.post_message(NodeProgress(node_id=self._id, progress=0, total=total))

        for i, asset in enumerate(asset_list.assets):
            res = collection.get(asset.id)

            if len(res["ids"]) == 0:
                if asset.content_type.startswith("text"):
                    text = await context.download_asset(asset.id)
                    collection.add(
                        ids=[asset.id], documents=[text.read().decode("utf-8")]
                    )
                if asset.content_type.startswith("image"):
                    image_io = await context.download_asset(asset.id)
                    image = PIL.Image.open(image_io)
                    collection.add(ids=[asset.id], images=[np.array(image)])
            context.post_message(
                NodeProgress(node_id=self._id, progress=i, total=total)
            )

        return self.folder


class IndexImageList(ChromaNode):
    """
    Index a list of image assets.
    """

    collection: ChromaCollection = Field(
        default=ChromaCollection(), description="The collection to index"
    )
    images: list[ImageRef] = Field(
        default_factory=list, description="List of image assets to index"
    )

    async def process(self, context: ProcessingContext) -> List[str]:
        collection = self.get_or_create_collection(context, self.collection)
        total = len(self.images)
        context.post_message(NodeProgress(node_id=self._id, progress=0, total=total))
        ids = []

        for i, image_ref in enumerate(self.images):
            if not image_ref.asset_id:
                raise ValueError(
                    "The image needs to be an asset that is saved to a folder"
                )

            res = collection.get(image_ref.asset_id)

            if len(res["ids"]) == 0:
                image = await context.image_to_pil(image_ref)
                collection.add(ids=[image_ref.asset_id], images=[np.array(image)])

            ids.append(image_ref.asset_id)

            context.post_message(
                NodeProgress(node_id=self._id, progress=i, total=total)
            )

        return ids


class IndexTextList(ChromaNode):
    """
    Index a list of text assets.
    """

    collection: ChromaCollection = Field(
        default=ChromaCollection(), description="The collection to index"
    )
    docs: list[TextRef] = Field(
        default=[],
        description="Dictionary of ID to text content pairs to index",
    )

    async def process(self, context: ProcessingContext) -> list[str]:
        collection = self.get_or_create_collection(context, self.collection)
        ids = []

        for doc in self.docs:
            if not doc.asset_id:
                raise ValueError(
                    "The text needs to be an asset that is saved to a folder"
                )

            res = collection.get(doc.asset_id)

            if len(res["ids"]) == 0:
                text = await context.text_to_str(doc.asset_id)
                collection.add(ids=[doc.asset_id], documents=[text])

            ids.append(doc.asset_id)

        return ids


class IndexImage(ChromaNode):
    """
    Index a single image asset.
    """

    collection: ChromaCollection = Field(
        default=ChromaCollection(), description="The collection to index"
    )
    image: ImageRef = Field(default=ImageRef(), description="Image asset to index")

    async def process(self, context: ProcessingContext) -> str:
        if not self.image.asset_id:
            raise ValueError("The image needs to be an asset that is saved to a folder")

        collection = self.get_or_create_collection(context, self.collection)
        res = collection.get(self.image.asset_id)

        if len(res["ids"]) == 0:
            image = await context.image_to_pil(self.image)
            collection.add(ids=[self.image.asset_id], images=[np.array(image)])

        return self.image.asset_id


class IndexText(ChromaNode):
    """
    Index a single text asset.
    """

    collection: ChromaCollection = Field(
        default=ChromaCollection(), description="The collection to index"
    )
    text: TextRef = Field(default=TextRef(), description="Text asset to index")

    async def process(self, context: ProcessingContext) -> str:
        if not self.text.asset_id:
            raise ValueError("The text needs to be an asset that is saved to a folder")

        collection = self.get_or_create_collection(context, self.collection)
        res = collection.get(self.text.asset_id)

        if len(res["ids"]) == 0:
            text = await context.text_to_str(self.text.asset_id)
            collection.add(ids=[self.text.asset_id], documents=[text])

        return self.text.asset_id
