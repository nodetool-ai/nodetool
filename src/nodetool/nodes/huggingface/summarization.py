from nodetool.metadata.types import HFTextGeneration
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field


class Summarize(HuggingFacePipelineNode):
    model: HFTextGeneration = Field(
        default=HFTextGeneration(),
        title="Model ID on Huggingface",
        description="The model ID to use for the text generation",
    )
    inputs: str = Field(
        default="",
        title="Inputs",
        description="The input text to summarize",
    )
    max_length: int = Field(
        default=100,
        title="Max Length",
        description="The maximum length of the generated text",
    )
    do_sample: bool = Field(
        default=False,
        title="Do Sample",
        description="Whether to sample from the model",
    )

    @classmethod
    def get_recommended_models(cls):
        return [
            HFTextGeneration(
                repo_id="Falconsai/text_summarization",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTextGeneration(
                repo_id="Falconsai/medical_summarization",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTextGeneration(
                repo_id="imvladikon/het5_summarization",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "summarization", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> str:
        assert self._pipeline is not None
        inputs = self.inputs
        params = {
            "max_length": self.max_length,
            "do_sample": self.do_sample,
        }

        result = self._pipeline(inputs, **params)
        assert result is not None
        return result[0]["summary_text"]  # type: ignore
