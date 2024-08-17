from enum import Enum
from typing import Any
from pydantic import Field
from nodetool.metadata.types import ColumnDef, DataframeRef
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


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

    class TextGenerationModelId(str, Enum):
        GPT2 = "openai-community/gpt2"
        DISTILGPT2 = "distilbert/distilgpt2"
        QWEN2_0_5 = "Qwen/Qwen2-0.5B-Instruct"
        STARCODER = "bigcode/starcoder"

    model: TextGenerationModelId = Field(
        default=TextGenerationModelId.GPT2,
        title="Model ID on Huggingface",
        description="The model ID to use for the text generation",
    )
    inputs: str = Field(
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

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "text-generation"

    def get_params(self):
        return {
            "max_new_tokens": self.max_new_tokens,
            "temperature": self.temperature,
            "top_p": self.top_p,
            "do_sample": self.do_sample,
        }

    async def get_inputs(self, context: ProcessingContext):
        return self.inputs

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> str:
        return result[0]["generated_text"]

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> str:
        return result[0]["generated_text"]

    async def process(self, context: ProcessingContext) -> str:
        return await super().process(context)


class TextClassifier(HuggingFacePipelineNode):
    class TextClassifierModelId(str, Enum):
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

    model: TextClassifierModelId = Field(
        default=TextClassifierModelId.CARDIFFNLP_TWITTER_ROBERTA_BASE_SENTIMENT_LATEST,
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
        return "text-classification"

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return result[0]

    async def process_local_result(
        self, contex: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {i["label"]: i["score"] for i in list(result)}

    async def process(self, context: ProcessingContext) -> dict[str, float]:
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
        return "summarization"

    def get_params(self):
        return {
            "max_length": self.max_length,
            "do_sample": self.do_sample,
        }

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> str:
        return result[0]["summary_text"]

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> str:
        return result[0]["summary_text"]

    async def process(self, context: ProcessingContext) -> str:
        return await super().process(context)


class QuestionAnswering(HuggingFacePipelineNode):
    """
    Answers questions based on a given context.
    text, question answering, natural language processing

    Use cases:
    - Automated customer support
    - Information retrieval from documents
    - Reading comprehension tasks
    - Enhancing search functionality
    """

    class QuestionAnsweringModelId(str, Enum):
        DISTILBERT_BASE_CASED_DISTILLED_SQUAD = "distilbert-base-cased-distilled-squad"
        BERT_LARGE_UNCASED_WHOLE_WORD_MASKING_FINETUNED_SQUAD = (
            "bert-large-uncased-whole-word-masking-finetuned-squad"
        )
        DEEPSET_ROBERTA_BASE_SQUAD2 = "deepset/roberta-base-squad2"
        DISTILBERT_BASE_UNCASED_DISTILLED_SQUAD = (
            "distilbert-base-uncased-distilled-squad"
        )

    model: QuestionAnsweringModelId = Field(
        default=QuestionAnsweringModelId.DISTILBERT_BASE_CASED_DISTILLED_SQUAD,
        title="Model ID on Huggingface",
        description="The model ID to use for question answering",
    )
    context: str = Field(
        default="",
        title="Context",
        description="The context or passage to answer questions from",
    )
    question: str = Field(
        default="",
        title="Question",
        description="The question to be answered based on the context",
    )

    def get_model_id(self):
        return self.model.value

    async def get_inputs(self, context: ProcessingContext):
        return {
            "question": self.question,
            "context": self.context,
        }

    @property
    def pipeline_task(self) -> str:
        return "question-answering"

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, Any]:
        return await self.process_local_result(context, result)

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, Any]:
        return {
            "answer": result["answer"],
            "score": result["score"],
            "start": result["start"],
            "end": result["end"],
        }

    async def process(self, context: ProcessingContext) -> dict[str, Any]:
        return await super().process(context)


class FillMask(HuggingFacePipelineNode):
    """
    Fills in a masked token in a given text.
    text, fill-mask, natural language processing

    Use cases:
    - Text completion
    - Sentence prediction
    - Language understanding tasks
    - Generating text options
    """

    class FillMaskModelId(str, Enum):
        BERT_BASE_UNCASED = "bert-base-uncased"
        ROBERTA_BASE = "roberta-base"
        DISTILBERT_BASE_UNCASED = "distilbert-base-uncased"
        ALBERT_BASE_V2 = "albert-base-v2"

    model: FillMaskModelId = Field(
        default=FillMaskModelId.BERT_BASE_UNCASED,
        title="Model ID on Huggingface",
        description="The model ID to use for fill-mask task",
    )
    inputs: str = Field(
        default="The capital of France is [MASK].",
        title="Inputs",
        description="The input text with [MASK] token to be filled",
    )
    top_k: int = Field(
        default=5,
        title="Top K",
        description="Number of top predictions to return",
    )

    async def get_inputs(self, context: ProcessingContext):
        return self.inputs

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "fill-mask"

    def get_params(self):
        return {
            "top_k": self.top_k,
        }

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> DataframeRef:
        return await self.process_local_result(context, result)

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> DataframeRef:
        data = [[item["token_str"], item["score"]] for item in result]
        columns = [
            ColumnDef(name="token", data_type="string"),
            ColumnDef(name="score", data_type="float"),
        ]
        return DataframeRef(columns=columns, data=data)

    async def process(self, context: ProcessingContext) -> list[dict[str, Any]]:
        return await super().process(context)


class TableQuestionAnswering(HuggingFacePipelineNode):
    """
    Answers questions based on tabular data.
    table, question answering, natural language processing

    Use cases:
    - Querying databases using natural language
    - Analyzing spreadsheet data with questions
    - Extracting insights from tabular reports
    - Automated data exploration
    """

    class TableQuestionAnsweringModelId(str, Enum):
        GOOGLE_TAPAS_BASE_FINETUNED_WTQ = "google/tapas-base-finetuned-wtq"
        MICROSOFT_TAPEX_LARGE_FINETUNED_TABFACT = (
            "microsoft/tapex-large-finetuned-tabfact"
        )
        GOOGLE_TAPAS_LARGE_FINETUNED_SQA = "google/tapas-large-finetuned-sqa"

    model: TableQuestionAnsweringModelId = Field(
        default=TableQuestionAnsweringModelId.GOOGLE_TAPAS_BASE_FINETUNED_WTQ,
        title="Model ID on Huggingface",
        description="The model ID to use for table question answering",
    )
    inputs: DataframeRef = Field(
        default=DataframeRef(),
        title="Table",
        description="The input table to query",
    )
    question: str = Field(
        default="",
        title="Question",
        description="The question to be answered based on the table",
    )

    def get_model_id(self):
        return self.model.value

    async def get_inputs(self, context: ProcessingContext):
        table = await context.dataframe_to_pandas(self.inputs)
        return {
            "table": table,
            "query": self.question,
        }

    @property
    def pipeline_task(self) -> str:
        return "table-question-answering"

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, Any]:
        return await self.process_local_result(context, result)

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, Any]:
        return {
            "answer": result["answer"],
            "coordinates": result.get("coordinates"),
            "cells": result.get("cells"),
            "aggregator": result.get("aggregator"),
        }

    async def process(self, context: ProcessingContext) -> dict[str, Any]:
        return await super().process(context)


class TextToText(HuggingFacePipelineNode):
    """
    Performs text-to-text generation tasks.
    text, generation, translation, summarization, natural language processing

    Use cases:
    - Text translation
    - Text summarization
    - Paraphrasing
    - Text style transfer
    """

    class TextToTextModelId(str, Enum):
        GOOGLE_FLAN_T5_SMALL = "google/flan-t5-small"
        GOOGLE_FLAN_T5_BASE = "google/flan-t5-base"
        GOOGLE_FLAN_T5_LARGE = "google/flan-t5-large"
        COEDIT_LARGE = "grammarly/coedit-large"
        AYA_101 = "CohereForAI/aya-101"

    model: TextToTextModelId = Field(
        default=TextToTextModelId.GOOGLE_FLAN_T5_SMALL,
        title="Model ID on Huggingface",
        description="The model ID to use for the text-to-text generation",
    )
    inputs: str = Field(
        default="",
        title="Input Text",
        description="The input text for the text-to-text task",
    )
    prefix: str = Field(
        default="",
        title="Task Prefix",
        description="The prefix to specify the task (e.g., 'translate English to French:', 'summarize:')",
    )
    max_length: int = Field(
        default=50,
        title="Max Length",
        description="The maximum length of the generated text",
    )
    num_return_sequences: int = Field(
        default=1,
        title="Number of Sequences",
        description="The number of alternative sequences to generate",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "text2text-generation"

    def get_params(self):
        return {
            "max_length": self.max_length,
            "num_return_sequences": self.num_return_sequences,
        }

    async def get_inputs(self, context: ProcessingContext):
        return f"{self.prefix} {self.inputs}".strip()

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> list[str]:
        return [item["generated_text"] for item in result]

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> list[str]:
        return [item["generated_text"] for item in result]

    async def process(self, context: ProcessingContext) -> list[str]:
        return await super().process(context)


class TokenClassification(HuggingFacePipelineNode):
    """
    Performs token classification tasks such as Named Entity Recognition (NER).
    text, token classification, named entity recognition, natural language processing

    Use cases:
    - Named Entity Recognition in text
    - Part-of-speech tagging
    - Chunking and shallow parsing
    - Information extraction from unstructured text
    """

    class TokenClassificationModelId(str, Enum):
        DBMDZ_BERT_LARGE_CASED_FINETUNED_CONLL03_ENGLISH = (
            "dbmdz/bert-large-cased-finetuned-conll03-english"
        )
        DSLIM_BERT_BASE_NER = "dslim/bert-base-NER"
        JEAN_BAPTISTE_CAMEMBERT_NER = "Jean-Baptiste/camembert-ner"
        FLAIR_POS_ENGLISH = "flair/pos-english"

    class AggregationStrategy(str, Enum):
        SIMPLE = "simple"
        FIRST = "first"
        AVERAGE = "average"
        MAX = "max"

    model: TokenClassificationModelId = Field(
        default=TokenClassificationModelId.DSLIM_BERT_BASE_NER,
        title="Model ID on Huggingface",
        description="The model ID to use for token classification",
    )
    inputs: str = Field(
        default="",
        title="Input Text",
        description="The input text for token classification",
    )
    aggregation_strategy: AggregationStrategy = Field(
        default=AggregationStrategy.SIMPLE,
        title="Aggregation Strategy",
        description="Strategy to aggregate tokens into entities",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "token-classification"

    def get_params(self):
        return {
            "aggregation_strategy": self.aggregation_strategy.value,
        }

    async def get_inputs(self, context: ProcessingContext):
        return self.inputs

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> DataframeRef:
        return await self.process_local_result(context, result)

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> DataframeRef:
        data = [
            [
                item["entity_group"],
                item["word"],
                item["start"],
                item["end"],
                float(item["score"]),
            ]
            for item in result
        ]
        columns = [
            ColumnDef(name="entity", data_type="string"),
            ColumnDef(name="word", data_type="string"),
            ColumnDef(name="start", data_type="int"),
            ColumnDef(name="end", data_type="int"),
            ColumnDef(name="score", data_type="float"),
        ]
        return DataframeRef(columns=columns, data=data)

    async def process(self, context: ProcessingContext) -> DataframeRef:
        return await super().process(context)


class Translation(HuggingFacePipelineNode):
    """
    Translates text from one language to another.
    text, translation, natural language processing

    Use cases:
    - Multilingual content creation
    - Cross-language communication
    - Localization of applications and websites
    - International market research
    """

    class LanguageCode(str, Enum):
        ENGLISH = "en"
        FRENCH = "fr"
        GERMAN = "de"
        SPANISH = "es"
        ITALIAN = "it"
        DUTCH = "nl"
        PORTUGUESE = "pt"
        RUSSIAN = "ru"
        CHINESE = "zh"
        SWEDISH = "sv"
        NORWEGIAN = "no"
        DANISH = "da"
        FINNISH = "fi"
        POLISH = "pl"
        CZECH = "cs"
        SLOVAK = "sk"
        SLOVENIAN = "sl"
        CROATIAN = "hr"
        SERBIAN = "sr"
        BOSNIAN = "bs"
        MONTENEGRIN = "me"
        ARABIC = "ar"
        HEBREW = "he"
        TURKISH = "tr"
        GREEK = "el"
        HINDI = "hi"
        BENGALI = "bn"
        PUNJABI = "pa"
        THAI = "th"
        VIETNAMESE = "vi"
        INDONESIAN = "id"
        MALAY = "ms"
        FILIPINO = "fil"
        KOERAN = "ko"
        JAPANESE = "ja"

    inputs: str = Field(
        default="",
        title="Input Text",
        description="The text to translate",
    )
    source_lang: LanguageCode = Field(
        default=LanguageCode.ENGLISH,
        title="Source Language",
        description="The source language code (e.g., 'en' for English)",
    )
    target_lang: LanguageCode = Field(
        default=LanguageCode.FRENCH,
        title="Target Language",
        description="The target language code (e.g., 'fr' for French)",
    )

    async def initialize(self, context: Any):
        from transformers import pipeline

        self._pipeline = pipeline(self.pipeline_task, device=context.device)

    @property
    def pipeline_task(self) -> str:
        return f"translation_{self.source_lang}_to_{self.target_lang}"

    def get_params(self):
        return {
            "src_lang": self.source_lang,
            "tgt_lang": self.target_lang,
        }

    async def get_inputs(self, context: ProcessingContext):
        return self.inputs

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> str:
        return result[0]["translation_text"]

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> str:
        return result[0]["translation_text"]

    async def process(self, context: ProcessingContext) -> str:
        return await super().process(context)


class ZeroShotTextClassifier(HuggingFacePipelineNode):
    """
    Performs zero-shot classification on text.
    text, classification, zero-shot, natural language processing

    Use cases:
    - Classify text into custom categories without training
    - Topic detection in documents
    - Sentiment analysis with custom sentiment labels
    - Intent classification in conversational AI
    """

    class ZeroShotTextClassifierModelId(str, Enum):
        FACEBOOK_BART_LARGE_MNLI = "facebook/bart-large-mnli"
        CROSS_ENCODER_NLI_DEBERTA_V3_BASE = "cross-encoder/nli-deberta-v3-base"
        MICROSOFT_DEBERTA_V2_XLARGE_MNLI = "microsoft/deberta-v2-xlarge-mnli"
        ROBERTA_LARGE_MNLI = "roberta-large-mnli"

    model: ZeroShotTextClassifierModelId = Field(
        default=ZeroShotTextClassifierModelId.FACEBOOK_BART_LARGE_MNLI,
        title="Model ID on Huggingface",
        description="The model ID to use for zero-shot classification",
    )
    inputs: str = Field(
        default="",
        title="Input Text",
        description="The text to classify",
    )
    candidate_labels: str = Field(
        default="",
        title="Candidate Labels",
        description="Comma-separated list of candidate labels for classification",
    )
    multi_label: bool = Field(
        default=False,
        title="Multi-label Classification",
        description="Whether to perform multi-label classification",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "zero-shot-classification"

    def get_params(self):
        return {
            "candidate_labels": self.candidate_labels.split(","),
            "multi_label": self.multi_label,
        }

    async def get_inputs(self, context: ProcessingContext):
        return self.inputs

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return dict(zip(result["labels"], result["scores"]))

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return dict(zip(result["labels"], result["scores"]))

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        return await super().process(context)
