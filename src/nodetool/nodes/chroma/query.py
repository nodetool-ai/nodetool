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

        # Create list of tuples to sort together
        combined = list(
            zip(
                result["ids"][0],
                result["documents"][0],
                result["metadatas"][0],
                result["distances"][0],
            )
        )
        # Sort by ID
        combined.sort(key=lambda x: str(x[0]))

        # Unzip the sorted results
        ids, documents, metadatas, distances = zip(*combined)
        ids = [str(id) for id in ids]

        return {
            "ids": ids,
            "documents": list(documents),
            "metadatas": list(metadatas),
            "distances": list(distances),
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

        # Create list of tuples to sort together
        combined = list(
            zip(
                result["ids"][0],
                result["documents"][0],
                result["metadatas"][0],
                result["distances"][0],
            )
        )
        # Sort by ID
        combined.sort(key=lambda x: str(x[0]))

        # Unzip the sorted results
        ids, documents, metadatas, distances = zip(*combined)
        ids = [str(id) for id in ids]

        return {
            "ids": ids,
            "documents": list(documents),
            "metadatas": list(metadatas),
            "distances": list(distances),
        }


class RemoveOverlap(ChromaNode):
    """
    Removes overlapping words between consecutive strings in a list.
    Splits text into words and matches word sequences for more accurate overlap detection.
    """

    documents: list[str] = Field(
        default_factory=list,
        description="List of strings to process for overlap removal",
    )
    min_overlap_words: int = Field(
        default=2,
        description="Minimum number of words that must overlap to be considered",
    )

    @classmethod
    def return_type(cls):
        return {"documents": list[str]}

    def _split_into_words(self, text: str) -> list[str]:
        """Split text into words, preserving spacing."""
        return text.split()

    def _find_word_overlap(self, words1: list[str], words2: list[str]) -> int:
        """Find the number of overlapping words between the end of words1 and start of words2."""
        if len(words1) < self.min_overlap_words or len(words2) < self.min_overlap_words:
            return 0

        # Start with maximum possible overlap
        max_check = min(len(words1), len(words2))

        for overlap_size in range(max_check, self.min_overlap_words - 1, -1):
            if words1[-overlap_size:] == words2[:overlap_size]:
                return overlap_size
        return 0

    async def process(self, context: ProcessingContext):
        if not self.documents:
            return {"documents": []}

        result = [self.documents[0]]

        for i in range(1, len(self.documents)):
            prev_words = self._split_into_words(result[-1])
            curr_words = self._split_into_words(self.documents[i])

            overlap_word_count = self._find_word_overlap(prev_words, curr_words)

            if overlap_word_count > 0:
                # Reconstruct the text without the overlapping words
                new_text = " ".join(curr_words[overlap_word_count:])
                if new_text:
                    result.append(new_text)
            else:
                result.append(self.documents[i])

        return {"documents": result}
