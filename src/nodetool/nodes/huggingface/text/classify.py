from enum import Enum
from pydantic import Field
from nodetool.nodes.huggingface import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext


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


class Classifier(HuggingfaceNode):
    """
    Text Classification is the task of assigning a label or class to a given text. Some use cases are sentiment analysis, natural language inference, and assessing grammatical correctness.
    classifier, text, huggingface

    ### Use Cases
    * You can track the sentiments of your customers from the product reviews using sentiment analysis models. This can help understand churn and retention by grouping reviews by sentiment, to later analyze the text and make strategic decisions based on this knowledge.
    """

    model: ModelId = Field(
        default=ModelId.CARDIFFNLP_TWITTER_ROBERTA_BASE_SENTIMENT_LATEST,
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    inputs: str = Field(
        title="Inputs",
        description="The input text to classify",
    )

    async def process(self, context: ProcessingContext) -> list[dict[str, float]]:
        result = await self.run_huggingface(
            model_id=self.model, context=context, params={"inputs": self.inputs}
        )
        return result  # type: ignore
