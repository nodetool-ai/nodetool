from enum import Enum
from pydantic import Field
from nodetool.metadata.types import RankingResult
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext


class Model(str, Enum):
    MXBAI = "mixedbread-ai/mxbai-rerank-large-v1"


class Rerank(BaseNode):
    model: Model = Field(default=Model.MXBAI, description="The reranking model to use")
    query: str = Field(default="", description="The question to rerank")
    documents: list[str] = Field(
        default=[], description="The answers to be ranked by the model."
    )
    top_k: int

    async def process(self, context: ProcessingContext) -> list[RankingResult]:
        from sentence_transformers import CrossEncoder

        model = CrossEncoder("mixedbread-ai/mxbai-rerank-large-v1")
        results = model.rank(
            self.query, self.documents, return_documents=True, top_k=self.top_k
        )
        return [RankingResult(score=res["score"], text=res["text"]) for res in results]
