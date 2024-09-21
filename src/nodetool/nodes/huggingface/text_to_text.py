from nodetool.metadata.types import HFText2TextGeneration
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field


class TextToText(HuggingFacePipelineNode):
    """
    Performs text-to-text generation tasks.
    text, generation, translation, summarization, natural language processing

    Use cases:
    - Text translation
    - Text summarization
    - Paraphrasing
    - Text style transfer
    """

    @classmethod
    def get_recommended_models(cls) -> list[HFText2TextGeneration]:
        return [
            HFText2TextGeneration(
                repo_id="google/flan-t5-small",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFText2TextGeneration(
                repo_id="google/flan-t5-base",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFText2TextGeneration(
                repo_id="google/flan-t5-large",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    model: HFText2TextGeneration = Field(
        default=HFText2TextGeneration(),
        title="Model ID on Huggingface",
        description="The model ID to use for the text-to-text generation",
    )
    inputs: str = Field(
        default="",
        title="Input Text",
        description="The input text for the text-to-text task",
    )
    prefix: str = Field(
        default="",
        title="Task Prefix",
        description="The prefix to specify the task (e.g., 'translate English to French:', 'summarize:')",
    )
    max_length: int = Field(
        default=50,
        title="Max Length",
        description="The maximum length of the generated text",
    )
    num_return_sequences: int = Field(
        default=1,
        title="Number of Sequences",
        description="The number of alternative sequences to generate",
    )

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "text2text-generation", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> list[str]:
        inputs = f"{self.prefix}: {self.inputs}".strip()
        result = self._pipeline(
            inputs,
            max_length=self.max_length,
            num_return_sequences=self.num_return_sequences,
        )  # type: ignore
        return [item["generated_text"] for item in result]  # type: ignore
