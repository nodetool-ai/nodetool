from nodetool.metadata.types import (
    AudioRef,
    HFAudioClassification,
    HFZeroShotAudioClassification,
    HuggingFaceModel,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


import torch
from pydantic import Field
from transformers import (
    AudioClassificationPipeline,
    ZeroShotAudioClassificationPipeline,
)


class AudioClassifier(HuggingFacePipelineNode):
    """
    Classifies audio into predefined categories.
    audio, classification, labeling, categorization

    Use cases:
    - Classify music genres
    - Detect speech vs. non-speech audio
    - Identify environmental sounds
    - Emotion recognition in speech

    Recommended models
    - MIT/ast-finetuned-audioset-10-10-0.4593
    - ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition
    """

    model: HFAudioClassification = Field(
        default=HFAudioClassification(),
        title="Model ID on Huggingface",
        description="The model ID to use for audio classification",
    )
    audio: AudioRef = Field(
        default=AudioRef(),
        title="Audio",
        description="The input audio to classify",
    )
    top_k: int = Field(
        default=10,
        title="Top K",
        description="The number of top results to return",
    )
    _pipeline: AudioClassificationPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFAudioClassification(
                repo_id="MIT/ast-finetuned-audioset-10-10-0.4593",
                allow_patterns=["*.safetensors", "*.json"],
            ),
            HFAudioClassification(
                repo_id="ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition",
                allow_patterns=["pytorch_model.bin", "*.json"],
            ),
        ]

    def required_inputs(self):
        return ["inputs"]

    def get_torch_dtype(self):
        return torch.float32

    def get_model_id(self):
        return self.model.repo_id

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        samples, _, _ = await context.audio_to_numpy(self.audio)
        result = self._pipeline(
            samples,
            top_k=self.top_k,
        )  # type: ignore
        return {item["label"]: item["score"] for item in result}  # type: ignore


class ZeroShotAudioClassifier(HuggingFacePipelineNode):
    """
    Classifies audio into categories without the need for training data.
    audio, classification, labeling, categorization, zero-shot

    Use cases:
    - Quickly categorize audio without training data
    - Identify sounds or music genres without predefined labels
    - Automate audio tagging for large datasets
    """

    model: HFZeroShotAudioClassification = Field(
        default=HFZeroShotAudioClassification(),
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    audio: AudioRef = Field(
        default=AudioRef(),
        title="Audio",
        description="The input audio to classify",
    )
    candidate_labels: str = Field(
        default="",
        title="Candidate Labels",
        description="The candidate labels to classify the audio against, separated by commas",
    )

    _pipeline: ZeroShotAudioClassificationPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFZeroShotAudioClassification(
                repo_id="laion/clap-htsat-unfused",
                allow_patterns=["model.safetensors", "*.json", "*.txt"],
            ),
        ]

    def required_inputs(self):
        return ["audio"]

    def get_model_id(self):
        return self.model.repo_id

    @property
    def pipeline_task(self) -> str:
        return "zero-shot-audio-classification"

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context, ZeroShotAudioClassificationPipeline, self.model.repo_id
        )

    def get_params(self):
        return {}

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        assert self._pipeline is not None, "Pipeline not initialized"
        samples, _, _ = await context.audio_to_numpy(self.audio)
        result = self._pipeline(
            samples, candidate_labels=self.candidate_labels.split(",")
        )
        return {item["label"]: item["score"] for item in result}  # type: ignore
