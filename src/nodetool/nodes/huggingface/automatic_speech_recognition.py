from nodetool.metadata.types import (
    AudioRef,
    HFAutomaticSpeechRecognition,
    HuggingFaceModel,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field


from typing import Any


class AutomaticSpeechRecognition(HuggingFacePipelineNode):
    """
    Transcribes spoken audio to text.
    asr, speech-to-text, audio, huggingface

    Use cases:
    - Transcribe interviews or meetings
    - Create subtitles for videos
    - Implement voice commands in applications
    """

    model: HFAutomaticSpeechRecognition = Field(
        default=HFAutomaticSpeechRecognition(),
        title="Model ID on Huggingface",
        description="The model ID to use for the speech recognition",
    )
    audio: AudioRef = Field(
        default=AudioRef(),
        title="Image",
        description="The input audio to transcribe",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFAutomaticSpeechRecognition(
                repo_id="openai/whisper-large-v3",
                allow_patterns=["model.safetensors", "*.json", "*.txt"],
            ),
            HFAutomaticSpeechRecognition(
                repo_id="openai/whisper-large-v2",
                allow_patterns=["model.safetensors", "*.json", "*.txt"],
            ),
            HFAutomaticSpeechRecognition(
                repo_id="openai/whisper-small",
                allow_patterns=["model.safetensors", "*.json", "*.txt"],
            ),
        ]

    def required_inputs(self):
        return ["inputs"]

    def get_model_id(self):
        return self.model.repo_id

    @property
    def pipeline_task(self) -> str:
        return "automatic-speech-recognition"

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> AudioRef:
        return result["text"]

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> AudioRef:
        return result["text"]

    async def get_inputs(self, context: ProcessingContext):
        samples, _, _ = await context.audio_to_numpy(self.audio)  # type: ignore
        return samples
