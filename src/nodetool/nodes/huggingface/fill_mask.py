from nodetool.metadata.types import ColumnDef, DataframeRef, HFFillMask
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field


from typing import Any


class FillMask(HuggingFacePipelineNode):
    """
    Fills in a masked token in a given text.
    text, fill-mask, natural language processing

    Use cases:
    - Text completion
    - Sentence prediction
    - Language understanding tasks
    - Generating text options
    """

    model: HFFillMask = Field(
        default=HFFillMask(),
        title="Model ID",
        description="The model ID to use for fill-mask task",
    )
    inputs: str = Field(
        default="The capital of France is [MASK].",
        title="Inputs",
        description="The input text with [MASK] token to be filled",
    )
    top_k: int = Field(
        default=5,
        title="Top K",
        description="Number of top predictions to return",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFFillMask]:
        return [
            HFFillMask(
                repo_id="bert-base-uncased",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFFillMask(
                repo_id="roberta-base",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFFillMask(
                repo_id="distilbert-base-uncased",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFFillMask(
                repo_id="albert-base-v2",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "fill-mask", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> dict[str, Any]:
        assert self._pipeline is not None
        result = self._pipeline(self.inputs, top_k=self.top_k)
        assert result is not None
        data = [[item["token_str"], item["score"]] for item in result]  # type: ignore
        columns = [
            ColumnDef(name="token", data_type="string"),
            ColumnDef(name="score", data_type="float"),
        ]
        return DataframeRef(columns=columns, data=data)  # type: ignore
