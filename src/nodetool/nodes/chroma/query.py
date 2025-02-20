from nodetool.common.chroma_client import get_collection
from nodetool.metadata.types import (
    Collection,
    ImageRef,
)
from nodetool.nodes.chroma.chroma_node import ChromaNode
from nodetool.workflows.processing_context import ProcessingContext

import numpy as np
from pydantic import Field
import re
from chromadb.api.types import IncludeEnum


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
        default=[],
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


class HybridSearch(ChromaNode):
    """
    Hybrid search combining semantic and keyword-based search for better retrieval.
    Uses reciprocal rank fusion to combine results from both methods.
    """

    collection: Collection = Field(
        default=Collection(), description="The collection to query"
    )
    text: str = Field(default="", description="The text to query")
    n_results: int = Field(
        default=5, description="The number of final results to return"
    )
    k_constant: float = Field(
        default=60.0, description="Constant for reciprocal rank fusion (default: 60.0)"
    )
    min_keyword_length: int = Field(
        default=3, description="Minimum length for keyword tokens"
    )

    @classmethod
    def return_type(cls):
        return {
            "ids": list[str],
            "documents": list[str],
            "metadatas": list[dict],
            "distances": list[float],
            "scores": list[float],
        }

    def _normalize_scores(self, scores: list[float]) -> list[float]:
        """Normalize scores to range [0, 1]"""
        if not scores:
            return scores
        min_score = min(scores)
        max_score = max(scores)
        if max_score == min_score:
            return [1.0] * len(scores)
        return [(s - min_score) / (max_score - min_score) for s in scores]

    def _reciprocal_rank_fusion(
        self, semantic_results: dict, keyword_results: dict
    ) -> tuple[list, list, list, list, list]:
        """
        Combine results using reciprocal rank fusion.
        Returns combined and sorted results (ids, documents, metadatas, distances, scores).
        """
        # Create a map to store combined scores
        combined_scores = {}

        # Process semantic search results
        for rank, (id_, doc, meta, dist) in enumerate(
            zip(
                semantic_results["ids"][0],
                semantic_results["documents"][0],
                semantic_results["metadatas"][0],
                semantic_results["distances"][0],
            )
        ):
            score = 1 / (rank + self.k_constant)
            combined_scores[id_] = {
                "doc": doc,
                "meta": meta,
                "distance": dist,
                "score": score,
            }

        # Process keyword search results
        for rank, (id_, doc, meta, dist) in enumerate(
            zip(
                keyword_results["ids"][0],
                keyword_results["documents"][0],
                keyword_results["metadatas"][0],
                keyword_results["distances"][0],
            )
        ):
            score = 1 / (rank + self.k_constant)
            if id_ in combined_scores:
                combined_scores[id_]["score"] += score
            else:
                combined_scores[id_] = {
                    "doc": doc,
                    "meta": meta,
                    "distance": dist,
                    "score": score,
                }

        # Sort by combined score
        sorted_results = sorted(
            combined_scores.items(), key=lambda x: x[1]["score"], reverse=True
        )

        # Unzip results
        ids = []
        docs = []
        metas = []
        distances = []
        scores = []

        for id_, data in sorted_results[: self.n_results]:
            ids.append(id_)
            docs.append(data["doc"])
            metas.append(data["meta"])
            distances.append(data["distance"])
            scores.append(data["score"])

        return ids, docs, metas, distances, scores

    def _get_keyword_query(self, text: str) -> dict:
        """Create keyword query from text"""
        pattern = r"[ ,.!?\-_=|]+"
        query_tokens = [
            token.strip()
            for token in re.split(pattern, text.lower())
            if len(token.strip()) >= self.min_keyword_length
        ]

        if not query_tokens:
            return {}

        if len(query_tokens) > 1:
            return {"$or": [{"$contains": token} for token in query_tokens]}
        return {"$contains": query_tokens[0]}

    async def process(self, context: ProcessingContext):
        if not self.text.strip():
            raise ValueError("Search text cannot be empty")

        collection = get_collection(self.collection.name)

        # Perform semantic search
        semantic_results = collection.query(
            query_texts=[self.text],
            n_results=self.n_results * 2,  # Get more results for better fusion
            include=[
                IncludeEnum.documents,
                IncludeEnum.metadatas,
                IncludeEnum.distances,
            ],
        )

        # Perform keyword search if we have valid keywords
        keyword_query = self._get_keyword_query(self.text)
        if keyword_query:
            keyword_results = collection.query(
                query_texts=[self.text],
                n_results=self.n_results * 2,
                where_document=keyword_query,
                include=[
                    IncludeEnum.documents,
                    IncludeEnum.metadatas,
                    IncludeEnum.distances,
                ],
            )
        else:
            keyword_results = semantic_results  # Fall back to semantic only

        # Validate results
        for results in [semantic_results, keyword_results]:
            assert results["ids"] is not None, "Ids are not returned"
            assert results["documents"] is not None, "Documents are not returned"
            assert results["metadatas"] is not None, "Metadatas are not returned"
            assert results["distances"] is not None, "Distances are not returned"

        # Combine results using reciprocal rank fusion
        ids, documents, metadatas, distances, scores = self._reciprocal_rank_fusion(
            dict(semantic_results), dict(keyword_results)
        )

        return {
            "ids": ids,
            "documents": documents,
            "metadatas": metadatas,
            "distances": distances,
            "scores": scores,
        }
