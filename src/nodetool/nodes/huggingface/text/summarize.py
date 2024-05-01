from pydantic import Field
from nodetool.common.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from enum import Enum


class ModelId(str, Enum):
    FALCONSAI_TEXT_SUMMARIZATION = "Falconsai/text_summarization"
    FALCONSAI_MEDICAL_SUMMARIZATION = "Falconsai/medical_summarization"
    IMVLADIKON_HET5_SUMMARIZATION = "imvladikon/het5_summarization"


class Summarize(HuggingfaceNode):
    """
    Summarization is the task of producing a shorter version of a document while preserving its important information. Some models can extract text from the original input, while other models can generate entirely new text.
    text, summarization, huggingface

    ### Use Cases
    Research papers can be summarized to allow researchers to spend less time selecting which articles to read. There are several approaches you can take for a task like this:

    Use an existing extractive summarization model on the Hub to do inference.
    Pick an existing language model trained for academic papers. This model can then be trained in a process called fine-tuning so it can solve the summarization task.
    Use a sequence-to-sequence model like T5 for abstractive text summarization.
    """

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
