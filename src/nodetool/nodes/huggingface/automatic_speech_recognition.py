import torch
from nodetool.metadata.types import (
    AudioRef,
    HFAutomaticSpeechRecognition,
    HuggingFaceModel,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext

from pydantic import Field
from typing import Any
from transformers import (
    AutomaticSpeechRecognitionPipeline,
    AutoModelForSpeechSeq2Seq,
    AutoProcessor,
)


class Whisper(HuggingFacePipelineNode):
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

    _pipeline: AutomaticSpeechRecognitionPipeline | None = None

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
        return ["audio"]

    async def initialize(self, context: ProcessingContext):
        torch_dtype = torch.float16 if torch.cuda.is_available() else torch.float32

        model = await self.load_model(
            context=context,
            model_class=AutoModelForSpeechSeq2Seq,
            model_id=self.model.repo_id,
            variant=None,
            low_cpu_mem_usage=True,
            use_safetensors=True,
            torch_dtype=torch_dtype,
        )

        processor = AutoProcessor.from_pretrained(self.model.repo_id)

        self._pipeline = await self.load_pipeline(
            context=context,
            pipeline_task="automatic-speech-recognition",
            model_id=model,
            tokenizer=processor.tokenizer,
            feature_extractor=processor.feature_extractor,
            torch_dtype=torch_dtype,
            device=context.device,
        )

    async def move_to_device(self, device: str):
        assert self._pipeline
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> str:
        assert self._pipeline

        samples, _, _ = await context.audio_to_numpy(self.audio, sample_rate=16_000)  # type: ignore

        result = self._pipeline(samples)

        return result["text"]  # type: ignore
