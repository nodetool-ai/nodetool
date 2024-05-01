from pydantic import Field
from nodetool.common.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from enum import Enum


class ModelId(str, Enum):
    GPT2 = "openai-community/gpt2"
    GPT2_MEDIUM = "openai-community/gpt2-medium"
    GPT2_LARGE = "openai-community/gpt2-large"
    DISTILGPT2 = "distilbert/distilgpt2"
    MICROSOFT_PHI_2 = "microsoft/phi-2"


class TextGeneration(HuggingfaceNode):
    """
    Generating text is the task of generating new text given another text. These models can, for example, fill in incomplete text or paraphrase.
    text, generation, huggingface, llm, language model

    Use Cases
    * A model trained for text generation can be later adapted to follow instructions. One of the most used open-source models for instruction is OpenAssistant, which you can try at Hugging Chat.

    * A Text Generation model, also known as a causal language model, can be trained on code from scratch to help the programmers in their repetitive coding tasks. One of the most popular open-source models for code generation is StarCoder, which can generate code in 80+ languages. You can try it here.

    * A story generation model can receive an input like "Once upon a time" and proceed to create a story-like text based on those first words. You can try this application which contains a model trained on story generation, by MosaicML.
    """

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
