from pydantic import Field
import PIL.Image
import numpy as np
from genflow.metadata.types import AssetRef, TextRef
from genflow.workflows.processing_context import ProcessingContext
from genflow.workflows.genflow_node import GenflowNode
from genflow.metadata.types import ImageRef
from genflow.metadata.types import FolderRef
from genflow.workflows.types import NodeProgress


class ChromaNode(GenflowNode):

    def get_or_create_collection(self, context: ProcessingContext, name: str):
        """
        Get or create a collection with the given name.

        Args:
            context: The processing context.
            name: The name of the collection to get or create.
        """
        from chromadb.utils.embedding_functions import OpenCLIPEmbeddingFunction
        from chromadb.utils.data_loaders import ImageLoader
        embedding_function = OpenCLIPEmbeddingFunction()
        data_loader = ImageLoader()
        client = context.get_chroma_client()
        
        return client.get_or_create_collection(
            name=name,
            embedding_function=embedding_function, 
            data_loader=data_loader
        )

    async def load_results(self, context: ProcessingContext, ids: list[str]) -> list[AssetRef]:
        asset_refs = []
        for id in ids:
            asset = await context.find_asset(str(id))
            if asset.content_type.startswith("image"):
                uri = await context.get_asset_url(asset.id)
                ref = ImageRef(asset_id=asset.id, uri=uri)
                asset_refs.append(ref)
            if  asset.content_type.startswith("text"):
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
        context.post_message(
            NodeProgress(node_id=self.id, progress=0, total=total)
        )
        
        for i, asset in enumerate(asset_list.assets):
            res = collection.get(asset.id)

            if len(res["ids"]) == 0:
                if asset.content_type.startswith("text"):
                    text = await context.download_asset(asset.id)
                    collection.add(
                        ids=[asset.id],
                        documents=[text.read().decode("utf-8")]
                    )
                if asset.content_type.startswith("image"):
                    image_io = await context.download_asset(asset.id)
                    image = PIL.Image.open(image_io)
                    collection.add(
                        ids=[asset.id],
                        images=[np.array(image)]
                    )
            context.post_message(
                NodeProgress(node_id=self.id, progress=i, total=total)
            )

        return self.folder



class QueryImage(ChromaNode):
    """ 
    Query the index for similar images.
    """

    folder: FolderRef = Field(default=FolderRef(), description="The folder to query")
    image: ImageRef = Field(default=ImageRef(), description="The image to query")
    n_results: int = Field(default=1, description="The number of results to return")

    async def process(self, context: ProcessingContext) -> list[AssetRef]:
        if not self.folder.asset_id:
            raise ValueError("The folder needs to be selected")
        if not self.image.asset_id:
            raise ValueError("The image needs to be selected")

        collection = self.get_or_create_collection(context, self.folder.asset_id)
        image_io = await context.download_asset(self.image.asset_id)
        image = PIL.Image.open(image_io)
        result = collection.query(query_images=[np.array(image)], n_results=self.n_results)
        ids = [str(id) for id in result["ids"][0]]

        return await self.load_results(context, ids)


class QueryText(ChromaNode):
    """
    Query the index for similar text.
    """
    
    folder: FolderRef = Field(default=FolderRef(), description="The folder to query")
    text: TextRef = Field(default=TextRef(), description="The text to query")
    n_results: int = Field(default=1, description="The number of results to return")

    async def process(self, context: ProcessingContext) -> list[AssetRef]:
        if not self.folder.asset_id:
            raise ValueError("The folder needs to be selected")
        if not self.text.asset_id:
            raise ValueError("The text needs to be selected")

        collection = self.get_or_create_collection(context, self.folder.asset_id)
        text_io = await context.download_asset(self.text.asset_id)
        text = text_io.read().decode("utf-8")
        result = collection.query(query_texts=[text], n_results=self.n_results)
        ids = [str(id) for id in result["ids"][0]]

        return await self.load_results(context, ids)

