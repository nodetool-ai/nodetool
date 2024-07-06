from enum import Enum
from typing import Literal
from pydantic import Field
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.metadata.types import BaseType
from nodetool.workflows.processing_context import ProcessingContext


class Classifier(HuggingfaceNode):
    """
    Classify text into predefined categories.
    classifier, text, sentiment, huggingface

    Use cases:
    - Sentiment analysis of product reviews
    - Topic classification of documents
    - Intent detection in chatbots
    - Spam detection in emails
    """

    class ModelId(str, Enum):
        CARDIFFNLP_TWITTER_ROBERTA_BASE_SENTIMENT_LATEST = (
            "cardiffnlp/twitter-roberta-base-sentiment-latest"
        )
        J_HARTMANN_EMOTION_ENGLISH_DISTILROBERTA_BASE = (
            "j-hartmann/emotion-english-distilroberta-base"
        )
        SAMLOWE_ROBERTA_BASE_GO_EMOTIONS = "SamLowe/roberta-base-go_emotions"
        PROSUSAI_FINBERT = "ProsusAI/finbert"
        DISTILBERT_BASE_UNCASED_FINETUNED_SST_2_ENGLISH = (
            "distilbert/distilbert-base-uncased-finetuned-sst-2-english"
        )

    model: ModelId = Field(
        default=ModelId.CARDIFFNLP_TWITTER_ROBERTA_BASE_SENTIMENT_LATEST,
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    inputs: str = Field(
        default="",
        title="Inputs",
        description="The input text to classify",
    )

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        result = await self.run_huggingface(
            model_id=self.model.value, context=context, params={"inputs": self.inputs}
        )
        return result[0]


class TextGeneration(HuggingfaceNode):
    """
    Generate new text based on input prompts.
    text generation, language model, huggingface

    Use cases:
    - Autocomplete suggestions in text editors
    - Creative writing assistance
    - Code generation for programming tasks
    - Chatbots and conversational AI
    """

    class ModelId(str, Enum):
        GPT2 = "openai-community/gpt2"
        GPT2_MEDIUM = "openai-community/gpt2-medium"
        GPT2_LARGE = "openai-community/gpt2-large"
        DISTILGPT2 = "distilbert/distilgpt2"
        MICROSOFT_PHI_2 = "microsoft/phi-2"

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


class Summarize(HuggingfaceNode):
    """
    Create concise summaries of longer texts.
    summarization, text, huggingface

    Use cases:
    - Summarizing research papers or articles
    - Generating news headlines
    - Creating executive summaries of reports
    - Condensing meeting notes or transcripts
    """

    class ModelId(str, Enum):
        FALCONSAI_TEXT_SUMMARIZATION = "Falconsai/text_summarization"
        FALCONSAI_MEDICAL_SUMMARIZATION = "Falconsai/medical_summarization"
        IMVLADIKON_HET5_SUMMARIZATION = "imvladikon/het5_summarization"

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
