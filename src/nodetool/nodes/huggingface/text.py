from enum import Enum
from typing import Literal
from pydantic import Field
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.metadata.types import BaseType
from nodetool.workflows.processing_context import ProcessingContext


class Classifier(HuggingfaceNode):
    """
    Text Classification is the task of assigning a label or class to a given text. Some use cases are sentiment analysis, natural language inference, and assessing grammatical correctness.
    classifier, text, huggingface

    ### Use Cases
    * You can track the sentiments of your customers from the product reviews using sentiment analysis models. This can help understand churn and retention by grouping reviews by sentiment, to later analyze the text and make strategic decisions based on this knowledge.
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
    Generating text is the task of generating new text given another text. These models can, for example, fill in incomplete text or paraphrase.
    text, generation, huggingface, llm, language model

    Use Cases
    * A model trained for text generation can be later adapted to follow instructions. One of the most used open-source models for instruction is OpenAssistant, which you can try at Hugging Chat.

    * A Text Generation model, also known as a causal language model, can be trained on code from scratch to help the programmers in their repetitive coding tasks. One of the most popular open-source models for code generation is StarCoder, which can generate code in 80+ languages. You can try it here.

    * A story generation model can receive an input like "Once upon a time" and proceed to create a story-like text based on those first words. You can try this application which contains a model trained on story generation, by MosaicML.
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
    Summarization is the task of producing a shorter version of a document while preserving its important information. Some models can extract text from the original input, while other models can generate entirely new text.
    text, summarization, huggingface

    ### Use Cases
    Research papers can be summarized to allow researchers to spend less time selecting which articles to read. There are several approaches you can take for a task like this:

    Use an existing extractive summarization model on the Hub to do inference.
    Pick an existing language model trained for academic papers. This model can then be trained in a process called fine-tuning so it can solve the summarization task.
    Use a sequence-to-sequence model like T5 for abstractive text summarization.
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
