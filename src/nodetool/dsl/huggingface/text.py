from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode

from nodetool.nodes.huggingface.text import FillMaskModelId

class FillMask(GraphNode):
    model: FillMaskModelId | GraphNode | tuple[GraphNode, str] = Field(default=FillMaskModelId('bert-base-uncased'), description='The model ID to use for fill-mask task')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='The capital of France is [MASK].', description='The input text with [MASK] token to be filled')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=5, description='Number of top predictions to return')
    @classmethod
    def get_node_type(cls): return "huggingface.text.FillMask"


from nodetool.nodes.huggingface.text import QuestionAnsweringModelId

class QuestionAnswering(GraphNode):
    model: QuestionAnsweringModelId | GraphNode | tuple[GraphNode, str] = Field(default=QuestionAnsweringModelId('distilbert-base-cased-distilled-squad'), description='The model ID to use for question answering')
    context: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The context or passage to answer questions from')
    question: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The question to be answered based on the context')
    @classmethod
    def get_node_type(cls): return "huggingface.text.QuestionAnswering"


from nodetool.nodes.huggingface.text import SummarizeModelId

class Summarize(GraphNode):
    model: SummarizeModelId | GraphNode | tuple[GraphNode, str] = Field(default=SummarizeModelId('Falconsai/text_summarization'), description='The model ID to use for the summarization')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text to the model')
    max_length: int | GraphNode | tuple[GraphNode, str] = Field(default=100, description='The maximum length of the generated text')
    do_sample: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to sample from the model')
    @classmethod
    def get_node_type(cls): return "huggingface.text.Summarize"


from nodetool.nodes.huggingface.text import TableQuestionAnsweringModelId

class TableQuestionAnswering(GraphNode):
    model: TableQuestionAnsweringModelId | GraphNode | tuple[GraphNode, str] = Field(default=TableQuestionAnsweringModelId('google/tapas-base-finetuned-wtq'), description='The model ID to use for table question answering')
    inputs: DataframeRef | GraphNode | tuple[GraphNode, str] = Field(default=DataframeRef(type='dataframe', uri='', asset_id=None, columns=None, data=None), description='The input table to query')
    question: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The question to be answered based on the table')
    @classmethod
    def get_node_type(cls): return "huggingface.text.TableQuestionAnswering"


from nodetool.nodes.huggingface.text import TextClassifierModelId

class TextClassifier(GraphNode):
    model: TextClassifierModelId | GraphNode | tuple[GraphNode, str] = Field(default=TextClassifierModelId('cardiffnlp/twitter-roberta-base-sentiment-latest'), description='The model ID to use for the classification')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text to the model')
    @classmethod
    def get_node_type(cls): return "huggingface.text.TextClassifier"


from nodetool.nodes.huggingface.text import TextGenerationModelId

class TextGeneration(GraphNode):
    model: TextGenerationModelId | GraphNode | tuple[GraphNode, str] = Field(default=TextGenerationModelId('openai-community/gpt2'), description='The model ID to use for the text generation')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text prompt for generation')
    max_new_tokens: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The maximum number of new tokens to generate')
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Controls randomness in generation. Lower values make it more deterministic.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=1.0, description='Controls diversity of generated text. Lower values make it more focused.')
    do_sample: bool | GraphNode | tuple[GraphNode, str] = Field(default=True, description='Whether to use sampling or greedy decoding')
    @classmethod
    def get_node_type(cls): return "huggingface.text.TextGeneration"


from nodetool.nodes.huggingface.text import TextToTextModelId

class TextToText(GraphNode):
    model: TextToTextModelId | GraphNode | tuple[GraphNode, str] = Field(default=TextToTextModelId('google/flan-t5-small'), description='The model ID to use for the text-to-text generation')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text for the text-to-text task')
    prefix: str | GraphNode | tuple[GraphNode, str] = Field(default='', description="The prefix to specify the task (e.g., 'translate English to French:', 'summarize:')")
    max_length: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='The maximum length of the generated text')
    num_return_sequences: int | GraphNode | tuple[GraphNode, str] = Field(default=1, description='The number of alternative sequences to generate')
    @classmethod
    def get_node_type(cls): return "huggingface.text.TextToText"


from nodetool.nodes.huggingface.text import TokenClassificationModelId
from nodetool.nodes.huggingface.text import AggregationStrategy

class TokenClassification(GraphNode):
    model: TokenClassificationModelId | GraphNode | tuple[GraphNode, str] = Field(default=TokenClassificationModelId('dslim/bert-base-NER'), description='The model ID to use for token classification')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The input text for token classification')
    aggregation_strategy: AggregationStrategy | GraphNode | tuple[GraphNode, str] = Field(default=AggregationStrategy('simple'), description='Strategy to aggregate tokens into entities')
    @classmethod
    def get_node_type(cls): return "huggingface.text.TokenClassification"


from nodetool.nodes.huggingface.text import LanguageCode
from nodetool.nodes.huggingface.text import LanguageCode

class Translation(GraphNode):
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to translate')
    source_lang: LanguageCode | GraphNode | tuple[GraphNode, str] = Field(default=LanguageCode('en'), description="The source language code (e.g., 'en' for English)")
    target_lang: LanguageCode | GraphNode | tuple[GraphNode, str] = Field(default=LanguageCode('fr'), description="The target language code (e.g., 'fr' for French)")
    @classmethod
    def get_node_type(cls): return "huggingface.text.Translation"


from nodetool.nodes.huggingface.text import ZeroShotTextClassifierModelId

class ZeroShotTextClassifier(GraphNode):
    model: ZeroShotTextClassifierModelId | GraphNode | tuple[GraphNode, str] = Field(default=ZeroShotTextClassifierModelId('facebook/bart-large-mnli'), description='The model ID to use for zero-shot classification')
    inputs: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='The text to classify')
    candidate_labels: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Comma-separated list of candidate labels for classification')
    multi_label: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='Whether to perform multi-label classification')
    @classmethod
    def get_node_type(cls): return "huggingface.text.ZeroShotTextClassifier"


