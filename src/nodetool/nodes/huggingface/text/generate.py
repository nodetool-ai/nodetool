from pydantic import Field
from nodetool.nodes.huggingface import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from enum import Enum


class ModelId(str, Enum):
    GPT2 = "openai-community/gpt2"
    GPT2_MEDIUM = "openai-community/gpt2-medium"
    GPT2_LARGE = "openai-community/gpt2-large"
    DISTILGPT2 = "distilbert/distilgpt2"
    MICROSOFT_PHI_2 = "microsoft/phi-2"


class TextGeneration(HuggingfaceNode):
    model: ModelId = Field(
        default=ModelId.MICROSOFT_PHI_2,
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    inputs: str = Field(
        title="Inputs",
        description="The input text to the model",
    )

    async def process(self, context: ProcessingContext) -> str:
        result = await self.run_huggingface(
            model_id=self.model, context=context, params={"inputs": self.inputs}
        )
        return result[0]["generated_text"]  # type: ignore
