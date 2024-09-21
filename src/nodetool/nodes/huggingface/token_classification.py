from nodetool.metadata.types import ColumnDef, DataframeRef, HFTokenClassification
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field


from enum import Enum


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
        assert self._pipeline is not None
        result = self._pipeline(
            self.inputs, aggregation_strategy=self.aggregation_strategy.value
        )
        data = [
            [
                item["entity_group"],  # type: ignore
                item["word"],  # type: ignore
                item["start"],  # type: ignore
                item["end"],  # type: ignore
                float(item["score"]),  # type: ignore
            ]
            for item in result  # type: ignore
        ]
        columns = [
            ColumnDef(name="entity", data_type="string"),
            ColumnDef(name="word", data_type="string"),
            ColumnDef(name="start", data_type="int"),
            ColumnDef(name="end", data_type="int"),
            ColumnDef(name="score", data_type="float"),
        ]
        return DataframeRef(columns=columns, data=data)
