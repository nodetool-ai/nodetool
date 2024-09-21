from nodetool.metadata.types import HFTextGeneration
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field


class TextGeneration(HuggingFacePipelineNode):
    """
    Generates text based on a given prompt.
    text, generation, natural language processing

    Use cases:
    - Creative writing assistance
    - Automated content generation
    - Chatbots and conversational AI
    - Code generation and completion
    """

    model: HFTextGeneration = Field(
        default=HFTextGeneration(),
        title="Model ID on Huggingface",
        description="The model ID to use for the text generation",
    )
    prompt: str = Field(
        default="",
        title="Prompt",
        description="The input text prompt for generation",
    )
    max_new_tokens: int = Field(
        default=50,
        title="Max New Tokens",
        description="The maximum number of new tokens to generate",
    )
    temperature: float = Field(
        default=1.0,
        title="Temperature",
        description="Controls randomness in generation. Lower values make it more deterministic.",
        ge=0.0,
        le=2.0,
    )
    top_p: float = Field(
        default=1.0,
        title="Top P",
        description="Controls diversity of generated text. Lower values make it more focused.",
        ge=0.0,
        le=1.0,
    )
    do_sample: bool = Field(
        default=True,
        title="Do Sample",
        description="Whether to use sampling or greedy decoding",
    )

    @classmethod
    def get_recommended_models(cls):
        return [
            HFTextGeneration(
                repo_id="gpt2", allow_patterns=["*.json", "*.txt", "*.safetensors"]
            ),
            HFTextGeneration(
                repo_id="distilgpt2",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTextGeneration(
                repo_id="Qwen/Qwen2-0.5B-Instruct",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTextGeneration(
                repo_id="bigcode/starcoder",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "text-generation", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> str:
        assert self._pipeline is not None
        result = self._pipeline(
            self.prompt,
            max_new_tokens=self.max_new_tokens,
            temperature=self.temperature,
            top_p=self.top_p,
            do_sample=self.do_sample,
        )
        assert result is not None
        return result[0]["generated_text"]  # type: ignore
