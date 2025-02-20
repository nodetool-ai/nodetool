import asyncio
import os
from nodetool.common.chroma_client import get_collection
from nodetool.metadata.types import (
    Collection,
    DocumentRef,
    ImageRef,
    LlamaModel,
    NPArray,
    Provider,
    TextChunk,
)
from nodetool.nodes.chroma.chroma_node import ChromaNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.types import NodeProgress

import numpy as np
from pydantic import Field
from typing import List

import PIL.Image
import numpy as np
from pydantic import Field

from enum import Enum


# class IndexFolder(ChromaNode):
#     """
#     Index all the assets in a folder.
#     """

#     @classmethod
#     def is_cacheable(cls):
#         return False

#     collection: ChromaCollection = Field(
#         default=ChromaCollection(), description="The collection to index"
#     )
#     folder: FolderRef = Field(default=FolderRef(), description="The folder to index")

#     async def process(self, context: ProcessingContext):
#         if self.folder.is_empty():
#             raise ValueError("The folder needs to be selected")

#         collection = self.get_or_create_collection(context, self.collection)

#         asset_list = await context.paginate_assets(self.folder.asset_id, MAX_INDEX_SIZE)
#         total = len(asset_list.assets)

#         # Download all assets in parallel
#         asset_downloads = await asyncio.gather(
#             *[context.download_asset(asset.id) for asset in asset_list.assets]
#         )

#         # Process into documents and images
#         ids = []
#         documents = []
#         images = []

#         for asset, content in zip(asset_list.assets, asset_downloads):
#             if asset.content_type.startswith("text"):
#                 ids.append(asset.id)
#                 documents.append(content.read().decode("utf-8"))
#             elif asset.content_type.startswith("image"):
#                 ids.append(asset.id)
#                 image = PIL.Image.open(content)
#                 images.append(np.array(image))

#         # Add all documents and images in one batch
#         if documents:
#             collection.add(
#                 ids=[id for id, doc in zip(ids, documents) if doc], documents=documents
#             )
#         if images:
#             collection.add(
#                 ids=[id for id, img in zip(ids, images) if img is not None],
#                 images=images,
#             )


class IndexImages(ChromaNode):
    """
    Index a list of image assets or files.
    chroma, embedding, collection, RAG, index, image, batch
    """

    collection: Collection = Field(
        default=Collection(), description="The collection to index"
    )
    images: list[ImageRef] = Field(
        default=[], description="List of image assets to index"
    )
    upsert: bool = Field(default=False, description="Whether to upsert the images")

    @classmethod
    def required_inputs(cls):
        return [
            "images",
        ]

    async def process(self, context: ProcessingContext):
        if any(img.document_id is None for img in self.images):
            raise ValueError("document_id cannot be None for any image")

        collection = get_collection(self.collection.name)
        total = len(self.images)
        context.post_message(NodeProgress(node_id=self._id, progress=0, total=total))
        # Validate all images have asset_ids
        invalid_images = [
            img
            for img in self.images
            if not img.asset_id and not img.uri.startswith("file://")
        ]
        if invalid_images:
            raise ValueError("All images need to be assets or local files")

        # Get images in parallel
        images = await asyncio.gather(
            *[context.image_to_pil(img) for img in self.images]
        )
        image_ids = [img.document_id for img in self.images]
        image_arrays = [np.array(img) for img in images]

        if self.upsert:
            collection.upsert(ids=image_ids, images=image_arrays)
        else:
            collection.add(ids=image_ids, images=image_arrays)


class IndexEmbedding(ChromaNode):
    """
    Index a list of embeddings.
    """

    collection: Collection = Field(
        default=Collection(), description="The collection to index"
    )
    embedding: NPArray = Field(default=NPArray(), description="The embedding to index")
    id: str = Field(default="", description="The ID to associate with the embedding")
    metadata: dict = Field(
        default={}, description="The metadata to associate with the embedding"
    )

    @classmethod
    def required_inputs(cls):
        return ["embedding", "id"]

    async def process(self, context: ProcessingContext):
        if self.id.strip() == "":
            raise ValueError("The ID cannot be empty")

        if self.embedding.is_empty():
            raise ValueError("The embedding cannot be empty")

        collection = get_collection(self.collection.name)
        collection.add(
            ids=[self.id],
            embeddings=[self.embedding.to_numpy()],
            metadatas=[self.metadata or {}],
        )


class IndexImage(ChromaNode):
    """
    Index a single image asset.
    chroma, embedding, collection, RAG, index, image
    """

    collection: Collection = Field(
        default=Collection(), description="The collection to index"
    )
    image: ImageRef = Field(default=ImageRef(), description="Image asset to index")
    metadata: dict = Field(
        default={}, description="The metadata to associate with the image"
    )

    async def process(self, context: ProcessingContext):
        if self.image.document_id is None:
            raise ValueError("document_id cannot be None")

        if not self.image.asset_id and not self.image.uri:
            raise ValueError("The image needs to have an asset_id or uri")

        document_id = self.image.document_id
        collection = get_collection(self.collection.name)
        image = await context.image_to_pil(self.image)
        collection.add(
            ids=[document_id],
            images=[np.array(image)],
            metadatas=[self.metadata or {}],
        )


class IndexTextChunk(ChromaNode):
    """
    Index a single text chunk.
    chroma, embedding, collection, RAG, index, text, chunk
    """

    collection: Collection = Field(
        default=Collection(), description="The collection to index"
    )
    text_chunk: TextChunk = Field(
        default=TextChunk(), description="Text chunk to index"
    )
    metadata: dict = Field(
        default={},
        description="The metadata to associate with the text chunk",
    )

    async def process(self, context: ProcessingContext):
        if not self.text_chunk.source_id.strip():
            raise ValueError("The source ID cannot be empty")

        collection = get_collection(self.collection.name)
        collection.add(
            ids=[self.text_chunk.get_document_id()],
            documents=[self.text_chunk.text],
            metadatas=[self.metadata or {}],
        )


class IndexTextChunks(ChromaNode):
    """
    Index multiple text chunks at once.
    chroma, embedding, collection, RAG, index, text, chunk, batch
    """

    collection: Collection = Field(
        default=Collection(), description="The collection to index"
    )
    text_chunks: List[TextChunk] = Field(
        default=[], description="List of text chunks to index"
    )

    async def process(self, context: ProcessingContext):
        if not self.text_chunks:
            return

        collection = get_collection(self.collection.name)

        # Extract document IDs and texts from chunks
        doc_ids = [chunk.get_document_id() for chunk in self.text_chunks]
        texts = [chunk.text for chunk in self.text_chunks]

        # Validate that all chunks have source IDs
        if any(not chunk.source_id.strip() for chunk in self.text_chunks):
            raise ValueError("All text chunks must have a source ID")

        collection.add(ids=doc_ids, documents=texts)


class EmbeddingAggregation(Enum):
    MEAN = "mean"
    MAX = "max"
    MIN = "min"
    SUM = "sum"


class IndexAggregatedText(ChromaNode):
    """
    Index multiple text chunks at once with aggregated embeddings from Ollama.
    chroma, embedding, collection, RAG, index, text, chunk, batch, ollama
    """

    collection: Collection = Field(
        default=Collection(), description="The collection to index"
    )
    document: str = Field(default="", description="The document to index")
    document_id: str = Field(
        default="", description="The document ID to associate with the text"
    )
    metadata: dict = Field(
        default={}, description="The metadata to associate with the text"
    )
    text_chunks: list[TextChunk | str] = Field(
        default=[], description="List of text chunks to index"
    )
    context_window: int = Field(
        default=4096,
        ge=1,
        description="The context window size to use for the model",
    )
    aggregation: EmbeddingAggregation = Field(
        default=EmbeddingAggregation.MEAN,
        description="The aggregation method to use for the embeddings.",
    )

    @classmethod
    def required_inputs(cls):
        return ["document", "text_chunks"]

    async def process(self, context: ProcessingContext):
        if not self.document_id.strip():
            raise ValueError("The document ID cannot be empty")

        if not self.document.strip():
            raise ValueError("The document cannot be empty")

        if not self.text_chunks:
            raise ValueError("The text chunks cannot be empty")

        collection = get_collection(self.collection.name)

        model = collection.metadata.get("embedding_model")
        if not model:
            raise ValueError("The collection does not have an embedding model")

        # Extract document IDs and texts from chunks
        texts = [
            chunk.text if isinstance(chunk, TextChunk) else chunk
            for chunk in self.text_chunks
        ]

        # Calculate embeddings for each chunk
        predictions = []
        for text in texts:
            prediction = await context.run_prediction(
                node_id=self._id,
                provider=Provider.Ollama,
                model=model,
                params={
                    "prompt": text,
                    "options": {"num_ctx": self.context_window},
                },
            )
            predictions.append(prediction)
        embeddings = [pred["embedding"] for pred in predictions]

        # Aggregate embeddings based on selected method
        if self.aggregation == EmbeddingAggregation.MEAN:
            aggregated_embedding = np.mean(embeddings, axis=0)
        elif self.aggregation == EmbeddingAggregation.MAX:
            aggregated_embedding = np.max(embeddings, axis=0)
        elif self.aggregation == EmbeddingAggregation.MIN:
            aggregated_embedding = np.min(embeddings, axis=0)
        elif self.aggregation == EmbeddingAggregation.SUM:
            aggregated_embedding = np.sum(embeddings, axis=0)
        else:
            raise ValueError(f"Invalid aggregation method: {self.aggregation}")

        collection.add(
            ids=[self.document_id],
            documents=[self.document],
            embeddings=[aggregated_embedding],
            metadatas=[self.metadata] if self.metadata else None,
        )


class IndexString(ChromaNode):
    """
    Index a string with a Document ID to a collection.
    chroma, embedding, collection, RAG, index, text, string

    Use cases:
    - Index documents for a vector search
    """

    collection: Collection = Field(
        default=Collection(), description="The collection to index"
    )
    text: str = Field(default="", description="Text content to index")
    document_id: str = Field(
        default="", description="Document ID to associate with the text content"
    )
    metadata: dict = Field(
        default={}, description="The metadata to associate with the text"
    )

    async def process(self, context: ProcessingContext):
        if not self.document_id.strip():
            raise ValueError("The document ID cannot be empty")

        collection = get_collection(self.collection.name)
        collection.add(ids=[self.document_id], documents=[self.text])
