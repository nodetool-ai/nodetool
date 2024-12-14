from nodetool.metadata.types import HFSentenceSimilarity, Tensor
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field


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
