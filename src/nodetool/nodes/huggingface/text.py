from enum import Enum
from typing import Any
from pydantic import Field
from nodetool.metadata.types import (
    ColumnDef,
    DataframeRef,
    HFFeatureExtraction,
    HFImageFeatureExtraction,
    HFQuestionAnswering,
    HFSentenceSimilarity,
    HFTextClassification,
    HFTextGeneration,
    HFFillMask,
    HFTableQuestionAnswering,
    HFText2TextGeneration,
    HFTokenClassification,
    HFTranslation,
    HFZeroShotClassification,
    Tensor,
)
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

    model: HFTextGeneration = Field(
        default=HFTextGeneration(),
        title="Model ID on Huggingface",
        description="The model ID to use for the text generation",
    )
    prompt: str = Field(
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

    @classmethod
    def get_recommended_models(cls) -> list[str]:
        return [
            HFTextGeneration(
                repo_id="gpt2", allow_patterns=["*.json", "*.txt", "*.safetensors"]
            ),
            HFTextGeneration(
                repo_id="distilgpt2",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTextGeneration(
                repo_id="Qwen/Qwen2-0.5B-Instruct",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTextGeneration(
                repo_id="bigcode/starcoder",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "text-generation", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)

    async def process(self, context: ProcessingContext) -> str:
        result = self._pipeline(
            self.prompt,
            max_new_tokens=self.max_new_tokens,
            temperature=self.temperature,
            top_p=self.top_p,
            do_sample=self.do_sample,
        )
        return result[0]["generated_text"]


class TextClassifier(HuggingFacePipelineNode):
    model: HFTextClassification = Field(
        default=HFTextClassification(),
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    prompt: str = Field(
        default="",
        title="Inputs",
        description="The input text to the model",
    )

    @classmethod
    def get_recommended_models(cls) -> list[str]:
        return [
            HFTextClassification(
                repo_id=model, allow_patterns=["*.json", "*.txt", "*.bin"]
            )
            for model in [
                "cardiffnlp/twitter-roberta-base-sentiment-latest",
                "michellejieli/emotion_text_classifier",
            ]
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "text-classification", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        result = self._pipeline(self.prompt)
        return {i["label"]: i["score"] for i in list(result)}


class Summarize(HuggingFacePipelineNode):
    model: HFTextGeneration = Field(
        default=HFTextGeneration(),
        title="Model ID on Huggingface",
        description="The model ID to use for the text generation",
    )
    prompt: str = Field(
        default="",
        title="Prompt",
        description="The input text prompt for generation",
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

    @classmethod
    def get_recommended_models(cls) -> list[str]:
        return [
            HFTextGeneration(
                repo_id="Falconsai/text_summarization",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTextGeneration(
                repo_id="Falconsai/medical_summarization",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTextGeneration(
                repo_id="imvladikon/het5_summarization",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "summarization", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)

    async def process(self, context: ProcessingContext) -> str:
        inputs = self.inputs
        model_id = self.model.repo_id
        params = {
            "max_length": self.max_length,
            "do_sample": self.do_sample,
        }

        result = self._pipeline(inputs, **params)
        return result[0]["summary_text"]


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

    model: HFQuestionAnswering = Field(
        default=HFQuestionAnswering(),
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

    @classmethod
    def get_recommended_models(cls) -> list[HFQuestionAnswering]:
        return [
            HFQuestionAnswering(
                repo_id="distilbert-base-cased-distilled-squad",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFQuestionAnswering(
                repo_id="bert-large-uncased-whole-word-masking-finetuned-squad",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFQuestionAnswering(
                repo_id="deepset/roberta-base-squad2",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFQuestionAnswering(
                repo_id="distilbert-base-uncased-distilled-squad",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "question-answering", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)

    async def process(self, context: ProcessingContext) -> dict[str, Any]:
        inputs = {
            "question": self.question,
            "context": self.context,
        }

        result = self._pipeline(inputs)
        return {
            "answer": result["answer"],
            "score": result["score"],
            "start": result["start"],
            "end": result["end"],
        }


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

    model: HFFillMask = Field(
        default=HFFillMask(),
        title="Model ID",
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

    @classmethod
    def get_recommended_models(cls) -> list[HFFillMask]:
        return [
            HFFillMask(
                repo_id="bert-base-uncased",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFFillMask(
                repo_id="roberta-base",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFFillMask(
                repo_id="distilbert-base-uncased",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFFillMask(
                repo_id="albert-base-v2",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "fill-mask", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)

    async def process(self, context: ProcessingContext) -> dict[str, Any]:
        result = self._pipeline(self.inputs, top_k=self.top_k)
        data = [[item["token_str"], item["score"]] for item in result]
        columns = [
            ColumnDef(name="token", data_type="string"),
            ColumnDef(name="score", data_type="float"),
        ]
        return DataframeRef(columns=columns, data=data)


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

    @classmethod
    def get_recommended_models(cls) -> list[HFTableQuestionAnswering]:
        return [
            HFTableQuestionAnswering(
                repo_id="google/tapas-base-finetuned-wtq",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTableQuestionAnswering(
                repo_id="microsoft/tapex-large-finetuned-tabfact",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTableQuestionAnswering(
                repo_id="google/tapas-large-finetuned-squad",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    model: HFTableQuestionAnswering = Field(
        default=HFTableQuestionAnswering(),
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

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "table-question-answering", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)

    @classmethod
    def get_return_type(cls):
        return {
            "answer": str,
            "coordinates": list[tuple[int, int]],
            "cells": list[str],
            "aggregator": str,
        }

    async def process(self, context: ProcessingContext):
        table = await context.dataframe_to_pandas(self.inputs)
        inputs = {
            "table": table,
            "query": self.question,
        }

        result = self.pipeline(inputs)

        return {
            "answer": result["answer"],
            "coordinates": result.get("coordinates"),
            "cells": result.get("cells"),
            "aggregator": result.get("aggregator"),
        }


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

    @classmethod
    def get_recommended_models(cls) -> list[HFText2TextGeneration]:
        return [
            HFText2TextGeneration(
                repo_id="google/flan-t5-small",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFText2TextGeneration(
                repo_id="google/flan-t5-base",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFText2TextGeneration(
                repo_id="google/flan-t5-large",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    model: HFText2TextGeneration = Field(
        default=HFText2TextGeneration(),
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

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "text2text-generation", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)

    async def process(self, context: ProcessingContext) -> list[str]:
        inputs = f"{self.prefix}: {self.inputs}".strip()
        result = self._pipeline(
            inputs,
            max_length=self.max_length,
            num_return_sequences=self.num_return_sequences,
        )
        return [item["generated_text"] for item in result]


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

    class AggregationStrategy(str, Enum):
        SIMPLE = "simple"
        FIRST = "first"
        AVERAGE = "average"
        MAX = "max"

    model: HFTokenClassification = Field(
        default=HFTokenClassification(),
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

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "token-classification", self.model.repo_id
        )

    async def process(self, context: ProcessingContext) -> DataframeRef:
        result = self._pipeline(
            self.inputs, aggregation_strategy=self.aggregation_strategy.value
        )
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

    model: HFTranslation = Field(
        default=HFTranslation(),
        title="Model ID on Huggingface",
        description="The model ID to use for translation",
    )
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

    @classmethod
    def get_recommended_models(cls) -> list[HFTranslation]:
        return [
            HFTranslation(
                repo_id="google-t5/t5-base",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTranslation(
                repo_id="google-t5/t5-large",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTranslation(
                repo_id="google-t5/t5-small",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = self.load_pipeline(
            context, self.pipeline_task, self.model.repo_id
        )

    @property
    def pipeline_task(self) -> str:
        return f"translation_{self.source_lang}_to_{self.target_lang}"

    async def process(self, context: ProcessingContext) -> str:
        self._pipeline(
            self.inputs, src_lang=self.source_lang, tgt_lang=self.target_lang
        )


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

    @classmethod
    def get_recommended_models(cls) -> list[HFZeroShotClassification]:
        return [
            HFZeroShotClassification(
                repo_id="facebook/bart-large-mnli",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFZeroShotClassification(
                repo_id="cross-encoder/nli-deberta-v3-base",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFZeroShotClassification(
                repo_id="microsoft/deberta-v2-xlarge-mnli",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFZeroShotClassification(
                repo_id="roberta-large-mnli",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    model: HFZeroShotClassification = Field(
        default=HFZeroShotClassification(),
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

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "zero-shot-classification", self.model.repo_id
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        assert self._pipeline is not None
        result = self._pipeline(
            self.inputs,
            candidate_labels=self.candidate_labels.split(","),
            multi_label=self.multi_label,
        )
        return dict(zip(result["labels"], result["scores"]))  # type: ignore


class FeatureExtraction(HuggingFacePipelineNode):
    """
    Extracts features from text using pre-trained models.
    text, feature extraction, embeddings, natural language processing

    Use cases:
    - Text similarity comparison
    - Clustering text documents
    - Input for machine learning models
    - Semantic search applications
    """

    model: HFFeatureExtraction = Field(
        default=HFFeatureExtraction(),
        title="Model ID on Huggingface",
        description="The model ID to use for feature extraction",
    )
    inputs: str = Field(
        default="",
        title="Input Text",
        description="The text to extract features from",
    )

    @classmethod
    def get_recommended_models(cls):
        return [
            HFFeatureExtraction(
                repo_id="mixedbread-ai/mxbai-embed-large-v1",
                allow_patterns=["*.safetensors", "*.txt", "*,json"],
            ),
            HFFeatureExtraction(
                repo_id="BAAI/bge-base-en-v1.5",
                allow_patterns=["*.safetensors", "*.txt", "*,json"],
            ),
            HFFeatureExtraction(
                repo_id="BAAI/bge-large-en-v1.5",
                allow_patterns=["*.safetensors", "*.txt", "*,json"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context=context,
            pipeline_task="feature-extraction",
            model_id=self.model.repo_id,
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> Tensor:
        # The result is typically a list of lists, where each inner list represents the features for a token
        # We'll return the mean of these features to get a single vector for the entire input
        import numpy as np

        assert self._pipeline is not None

        result = self._pipeline(self.inputs)

        assert isinstance(result, list)

        return Tensor.from_numpy(np.mean(result[0], axis=0))


class SentenceSimilarity(HuggingFacePipelineNode):
    """
    Compares the similarity between two sentences.
    text, sentence similarity, embeddings, natural language processing

    Use cases:
    - Duplicate detection in text data
    - Semantic search
    - Sentiment analysis
    """

    model: HFSentenceSimilarity = Field(
        default=HFSentenceSimilarity(),
        title="Model ID on Huggingface",
        description="The model ID to use for sentence similarity",
    )
    inputs: str = Field(
        default="",
        title="Input Text",
        description="The text to compare",
    )

    @classmethod
    def get_recommended_models(cls):
        return [
            HFSentenceSimilarity(
                repo_id="sentence-transformers/all-mpnet-base-v2",
                allow_patterns=["*.safetensors", "*.txt", "*,json"],
            ),
            HFSentenceSimilarity(
                repo_id="sentence-transformers/all-MiniLM-L6-v2",
                allow_patterns=["*.safetensors", "*.txt", "*,json"],
            ),
            HFSentenceSimilarity(
                repo_id="BAAI/bge-m3",
                allow_patterns=["*.safetensors", "*.txt", "*,json"],
            ),
            HFSentenceSimilarity(
                repo_id="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2",
                allow_patterns=["*.safetensors", "*.txt", "*,json"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context=context,
            pipeline_task="feature-extraction",
            model_id=self.model.repo_id,
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> Tensor:
        # The result is typically a list of lists, where each inner list represents the features for a token
        # We'll return the mean of these features to get a single vector for the entire input
        import numpy as np

        assert self._pipeline is not None

        result = self._pipeline(self.inputs)

        assert isinstance(result, list)

        return Tensor.from_numpy(np.mean(result[0], axis=0))
