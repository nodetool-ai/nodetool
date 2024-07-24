from enum import Enum
from typing import Any
from pydantic import Field
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext

class Classifier(HuggingFacePipelineNode):
    class ClassifierModelId(str, Enum):
        CARDIFFNLP_TWITTER_ROBERTA_BASE_SENTIMENT_LATEST = "cardiffnlp/twitter-roberta-base-sentiment-latest"
        J_HARTMANN_EMOTION_ENGLISH_DISTILROBERTA_BASE = "j-hartmann/emotion-english-distilroberta-base"
        SAMLOWE_ROBERTA_BASE_GO_EMOTIONS = "SamLowe/roberta-base-go_emotions"
        PROSUSAI_FINBERT = "ProsusAI/finbert"
        DISTILBERT_BASE_UNCASED_FINETUNED_SST_2_ENGLISH = "distilbert/distilbert-base-uncased-finetuned-sst-2-english"

    model: ClassifierModelId = Field(
        default=ClassifierModelId.CARDIFFNLP_TWITTER_ROBERTA_BASE_SENTIMENT_LATEST,
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    inputs: str = Field(
        default="",
        title="Inputs",
        description="The input text to the model",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return 'text-classification'

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> dict[str, float]:
        return result[0]

    async def process_local_result(self, contex: ProcessingContext, result: Any) -> dict[str, float]:
        return {i['label']: i['score'] for i in list(result)}
    
    async def process(self, context: ProcessingContext) -> dict[str, float]:
        return await super().process(context)


class TextGeneration(HuggingFacePipelineNode):
    class TextGenerationModelId(str, Enum):
        GPT2 = "openai-community/gpt2"
        GPT2_MEDIUM = "openai-community/gpt2-medium"
        GPT2_LARGE = "openai-community/gpt2-large"
        DISTILGPT2 = "distilbert/distilgpt2"

    model: TextGenerationModelId = Field(
        default=TextGenerationModelId.GPT2,
        title="Model ID on Huggingface",
        description="The model ID to use for the text generation",
    )
    inputs: str = Field(
        default="",
        title="Inputs",
        description="The input text to the model",
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

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return 'text-generation'

    def get_params(self):
        return {
            "max_length": self.max_length,
            "do_sample": self.do_sample,
        }

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> str:
        return result[0]["generated_text"]

    async def process_local_result(self, context: ProcessingContext, result: Any) -> str:
        return result[0]['generated_text']

    async def process(self, context: ProcessingContext) -> str:
        return await super().process(context)


class Summarize(HuggingFacePipelineNode):
    class SummarizeModelId(str, Enum):
        FALCONSAI_TEXT_SUMMARIZATION = "Falconsai/text_summarization"
        FALCONSAI_MEDICAL_SUMMARIZATION = "Falconsai/medical_summarization"
        IMVLADIKON_HET5_SUMMARIZATION = "imvladikon/het5_summarization"

    model: SummarizeModelId = Field(
        default=SummarizeModelId.FALCONSAI_TEXT_SUMMARIZATION,
        title="Model ID on Huggingface",
        description="The model ID to use for the summarization",
    )
    inputs: str = Field(
        default="",
        title="Inputs",
        description="The input text to the model",
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

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return 'summarization'

    def get_params(self):
        return {
            "max_length": self.max_length,
            "do_sample": self.do_sample,
        }

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> str:
        return result[0]["summary_text"]

    async def process_local_result(self, context: ProcessingContext, result: Any) -> str:
        return result[0]['summary_text']

    async def process(self, context: ProcessingContext) -> str:
        return await super().process(context)