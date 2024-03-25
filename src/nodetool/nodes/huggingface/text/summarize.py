from pydantic import Field
from nodetool.nodes.huggingface import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from enum import Enum


class ModelId(str, Enum):
    FALCONSAI_TEXT_SUMMARIZATION = "Falconsai/text_summarization"
    FALCONSAI_MEDICAL_SUMMARIZATION = "Falconsai/medical_summarization"
    IMVLADIKON_HET5_SUMMARIZATION = "imvladikon/het5_summarization"


class Summarize(HuggingfaceNode):
    model: ModelId = Field(
        default=ModelId.FALCONSAI_TEXT_SUMMARIZATION,
        title="Model ID on Huggingface",
        description="The model ID to use for the summarization",
    )
    inputs: str = Field(
        default="",
        title="Inputs",
        description="The input text to the model",
    )

    async def process(self, context: ProcessingContext) -> str:
        result = await self.run_huggingface(
            model_id=self.model.value, context=context, params={"inputs": self.inputs}
        )
        return result[0]["summary_text"]  # type: ignore
