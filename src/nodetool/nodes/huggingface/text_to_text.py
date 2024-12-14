from nodetool.metadata.types import HFText2TextGeneration
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field


class TextToText(HuggingFacePipelineNode):
    """
    Performs text-to-text generation tasks.
    text, generation, translation, question-answering, summarization, nlp, natural-language-processing

    Use cases:
    - Text translation
    - Text summarization
    - Paraphrasing
    - Text style transfer

    Usage:
    Start with a command like Translate, Summarize, or Q (for question)
    Follow with the text you want to translate, summarize, or answer a question about.
    Examples:
    - Translate to German: Hello
    - Summarize: The quick brown fox jumps over the lazy dog.
    - Q: Who ate the cookie? followed by the text of the cookie monster.
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
            HFText2TextGeneration(
                repo_id="gokaygokay/Flux-Prompt-Enhance",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    model: HFText2TextGeneration = Field(
        default=HFText2TextGeneration(),
        title="Model ID on Huggingface",
        description="The model ID to use for the text-to-text generation",
    )
    text: str = Field(
        default="",
        title="Input Text",
        description="The input text for the text-to-text task",
    )
    max_length: int = Field(
        default=50,
        title="Max Length",
        description="The maximum length of the generated text",
    )

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "text2text-generation", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> str:
        result = self._pipeline(
            self.text,
            max_length=self.max_length,
        )  # type: ignore
        assert isinstance(result, list)
        assert len(result) == 1
        return result[0]["generated_text"]  # type: ignore
