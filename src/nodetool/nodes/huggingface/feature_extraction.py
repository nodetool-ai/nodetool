from nodetool.metadata.types import HFFeatureExtraction, Tensor
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field


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
