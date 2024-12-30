from typing import List
import torch
from pydantic import Field
from transformers import AutoModelForSequenceClassification, AutoTokenizer

from nodetool.metadata.types import HFReranker
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


class Reranker(HuggingFacePipelineNode):
    """
    Reranks pairs of text based on their semantic similarity.
    text, ranking, reranking, natural language processing

    Use cases:
    - Improve search results ranking
    - Question-answer pair scoring
    - Document relevance ranking
    """

    model: HFReranker = Field(
        default=HFReranker(),
        title="Model ID on Huggingface",
        description="The model ID to use for reranking",
    )
    query: str = Field(
        default="",
        title="Query Text",
        description="The query text to compare against candidates",
    )
    candidates: List[str] = Field(
        default=[],
        title="Candidate Texts",
        description="List of candidate texts to rank",
    )

    _model: AutoModelForSequenceClassification | None = None
    _tokenizer: AutoTokenizer | None = None

    @classmethod
    def get_recommended_models(cls):
        return [
            HFReranker(
                repo_id="BAAI/bge-reranker-v2-m3",
                allow_patterns=["*.safetensors", "*.txt", "*.json"],
            ),
            HFReranker(
                repo_id="BAAI/bge-reranker-base",
                allow_patterns=["*.safetensors", "*.txt", "*.json"],
            ),
            HFReranker(
                repo_id="BAAI/bge-reranker-large",
                allow_patterns=["*.safetensors", "*.txt", "*.json"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):

        self._tokenizer = await self.load_model(
            context=context,
            model_class=AutoTokenizer,
            model_id=self.model.repo_id,
        )
        self._model = await self.load_model(
            context=context,
            model_class=AutoModelForSequenceClassification,
            model_id=self.model.repo_id,
        )
        self._model.eval()  # type: ignore

    async def move_to_device(self, device: str):
        self._model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        pairs = [[self.query, candidate] for candidate in self.candidates]

        with torch.no_grad():
            inputs = self._tokenizer(
                pairs,
                padding=True,
                truncation=True,
                return_tensors="pt",
                max_length=512,
            )  # type: ignore
            scores = (
                self._model(**inputs, return_dict=True)  # type: ignore
                .logits.view(
                    -1,
                )
                .float()
            )

        return dict(zip(self.candidates, scores.tolist()))
