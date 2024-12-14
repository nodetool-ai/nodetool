from nodetool.metadata.types import (
    DataframeRef,
    HFQuestionAnswering,
    HFTableQuestionAnswering,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field


from typing import Any


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
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> dict[str, Any]:
        assert self._pipeline is not None
        inputs = {
            "question": self.question,
            "context": self.context,
        }

        result = self._pipeline(inputs)
        assert result is not None
        return {
            "answer": result["answer"],  # type: ignore
            "score": result["score"],  # type: ignore
            "start": result["start"],  # type: ignore
            "end": result["end"],  # type: ignore
        }


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
                repo_id="google/tapas-large-finetuned-wtq",
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
    dataframe: DataframeRef = Field(
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
        self._pipeline.model.to(device)  # type: ignore

    @classmethod
    def return_type(cls):
        return {
            "answer": str,
            "coordinates": list[tuple[int, int]],
            "cells": list[str],
            "aggregator": str,
        }

    async def process(self, context: ProcessingContext):
        assert self._pipeline is not None
        table = await context.dataframe_to_pandas(self.dataframe)
        inputs = {
            "table": table.astype(str),
            "query": self.question,
        }

        result = self._pipeline(inputs)
        assert result is not None
        return {
            "answer": result["answer"],  # type: ignore
            "coordinates": result["coordinates"],  # type: ignore
            "cells": result["cells"],  # type: ignore
            "aggregator": result["aggregator"],  # type: ignore
        }
