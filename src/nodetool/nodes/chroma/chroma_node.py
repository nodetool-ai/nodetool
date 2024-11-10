from nodetool.common.environment import Environment
from nodetool.metadata.types import (
    AssetRef,
    ChromaCollection,
    ChromaEmbeddingFunctionEnum,
    ImageRef,
    TextRef,
)
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class ChromaNode(BaseNode):

    @classmethod
    def is_visible(cls):
        return cls is not ChromaNode

    async def load_results(
        self, context: ProcessingContext, ids: list[str]
    ) -> list[AssetRef]:
        asset_refs = []
        for id in ids:
            asset = await context.find_asset(str(id))
            if asset.content_type.startswith("image"):
                uri = await context.get_asset_url(asset.id)
                ref = ImageRef(asset_id=asset.id, uri=uri)
                asset_refs.append(ref)
            if asset.content_type.startswith("text"):
                uri = await context.get_asset_url(asset.id)
                ref = TextRef(asset_id=asset.id, uri=uri)
                asset_refs.append(ref)
        return asset_refs

    def get_or_create_collection(
        self, context: ProcessingContext, collection: ChromaCollection
    ):
        """
        Get or create a collection with the given name.

        Args:
            context: The processing context.
            collection: The collection to get or create.
        """
        from chromadb.utils import data_loaders
        from chromadb.utils.embedding_functions.open_clip_embedding_function import (
            OpenCLIPEmbeddingFunction,
        )
        from chromadb.utils.embedding_functions.openai_embedding_function import (
            OpenAIEmbeddingFunction,
        )
        from chromadb.utils.embedding_functions.ollama_embedding_function import (
            OllamaEmbeddingFunction,
        )

        if (
            collection.embedding_function.embedding_function
            == ChromaEmbeddingFunctionEnum.OPENCLIP
        ):
            embedding_function = OpenCLIPEmbeddingFunction()
        elif (
            collection.embedding_function.embedding_function
            == ChromaEmbeddingFunctionEnum.OPENAI
        ):
            assert collection.embedding_function.model is not None
            embedding_function = OpenAIEmbeddingFunction(
                api_key=Environment.get_openai_api_key(),
                model_name=collection.embedding_function.model,
            )
        elif (
            collection.embedding_function.embedding_function
            == ChromaEmbeddingFunctionEnum.OLLAMA
        ):
            assert collection.embedding_function.model is not None
            embedding_function = OllamaEmbeddingFunction(
                url=Environment.get_ollama_api_url(),
                model_name=collection.embedding_function.model,
            )
        else:
            raise ValueError(
                f"Unknown embedding function: {collection.embedding_function.embedding_function}"
            )

        data_loader = data_loaders.ImageLoader()
        client = context.get_chroma_client()

        return client.get_or_create_collection(
            name=collection.name,
            embedding_function=embedding_function,  # type: ignore
            data_loader=data_loader,
        )
