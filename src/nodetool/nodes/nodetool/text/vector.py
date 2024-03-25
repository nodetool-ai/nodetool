from pydantic import Field
import PIL.Image
import numpy as np
from nodetool.metadata.types import AssetRef, TextRef
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef
from nodetool.metadata.types import FolderRef
from nodetool.workflows.types import NodeProgress
from nodetool.workflows.base_node import BaseNode


class ChromaNode(BaseNode):

    def get_or_create_collection(self, context: ProcessingContext, name: str):
        """
        Get or create a collection with the given name.

        Args:
            context: The processing context.
            name: The name of the collection to get or create.
        """
        from chromadb.utils.embedding_functions import (
            SentenceTransformerEmbeddingFunction,
        )

        embedding_function = SentenceTransformerEmbeddingFunction()
        client = context.get_chroma_client()

        return client.get_or_create_collection(
            name=name,
            embedding_function=embedding_function,  # type: ignore
        )

    async def load_results(
        self, context: ProcessingContext, ids: list[str]
    ) -> list[AssetRef]:
        asset_refs = []
        for id in ids:
            asset = await context.find_asset(str(id))
            if asset.content_type.startswith("text"):
                uri = await context.get_asset_url(asset.id)
                ref = TextRef(asset_id=asset.id, uri=uri)
                asset_refs.append(ref)
        return asset_refs


MAX_INDEX_SIZE = 1000


class IndexFolder(ChromaNode):
    """
    Index all the assets in a folder.
    """

    folder: FolderRef = Field(default=FolderRef(), description="The folder to index")

    async def process(self, context: ProcessingContext) -> FolderRef:
        if not self.folder.asset_id:
            raise ValueError("The folder needs to be selected")
        collection = self.get_or_create_collection(context, self.folder.asset_id)

        asset_list = await context.paginate_assets(self.folder.asset_id, MAX_INDEX_SIZE)
        total = len(asset_list.assets)
        context.post_message(NodeProgress(node_id=self.id, progress=0, total=total))

        for i, asset in enumerate(asset_list.assets):
            res = collection.get(asset.id)

            if len(res["ids"]) == 0:
                if asset.content_type.startswith("text"):
                    text = await context.download_asset(asset.id)
                    collection.add(
                        ids=[asset.id], documents=[text.read().decode("utf-8")]
                    )
            context.post_message(NodeProgress(node_id=self.id, progress=i, total=total))

        return self.folder


class QueryText(ChromaNode):
    """
    Query the index for similar images.
    """

    folder: FolderRef = Field(default=FolderRef(), description="The folder to query")
    text: TextRef = Field(default=TextRef(), description="The text to query")
    n_results: int = Field(default=1, description="The number of results to return")

    async def process(self, context: ProcessingContext) -> list[AssetRef]:
        if not self.folder.asset_id:
            raise ValueError("The folder needs to be selected")
        if not self.text.asset_id:
            raise ValueError("Text input is required")

        collection = self.get_or_create_collection(context, self.folder.asset_id)
        text_io = await context.download_asset(self.text.asset_id)
        text = text_io.read().decode("utf-8")
        result = collection.query(query_texts=[text], n_results=self.n_results)
        ids = [str(id) for id in result["ids"][0]]

        return await self.load_results(context, ids)
