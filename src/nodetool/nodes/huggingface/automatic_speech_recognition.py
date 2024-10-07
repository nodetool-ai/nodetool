import torch
import logging
from nodetool.metadata.types import (
    AudioRef,
    HFAutomaticSpeechRecognition,
    HuggingFaceModel,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext

from pydantic import Field
from typing import  Optional, Tuple, ClassVar
from transformers import (
    AutomaticSpeechRecognitionPipeline,
    AutoModelForSpeechSeq2Seq,
    AutoProcessor,
)
from enum import Enum

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


class Whisper(HuggingFacePipelineNode):
    """
    Convert speech to text
    asr, speech-to-text, translate, transcribe, audio, huggingface

    **Use Cases:**
    - Voice input for a chatbot
    - Transcribe or translate audio files
    - Create subtitles for videos

    **Features:**
    - Multilingual speech recognition
    - Speech translation
    - Language identification
    - Supported languages include: Spanish, Italian, Korean, Portuguese, Dutch, German, Russian, English, Polish, Japanese, French, Catalan, Indonesian, Turkish, Swedish, Mandarin (Taiwan), Mandarin (China), Czech, Ukrainian, Romanian
    """

    class Task(str, Enum):
        TRANSCRIBE = "transcribe"
        TRANSLATE = "translate"

    model: HFAutomaticSpeechRecognition = Field(
        default=HFAutomaticSpeechRecognition(),
        title="Model ID on Huggingface",
        description="The model ID to use for the speech recognition.",
    )
    audio: AudioRef = Field(
        default=AudioRef(),
        title="Audio Input",
        description="The input audio to transcribe.",
    )

    task: Optional[Task] = Field(
        default=Task.TRANSCRIBE,
        title="Task",
        description="The task to perform: 'transcribe' for speech-to-text or 'translate' for speech translation.",
    )
    language: Optional[str] = Field(
        default=None,
        title="Language",
        description="The language of the input audio. If not specified, the model will attempt to detect it automatically. example: spanish, italian, dutch, korean, german, french",
    )
    chunk_length_s: Optional[float] = Field(
        default=None,
        title="Chunk Length (seconds)",
        description=(
            "Length of each audio chunk in seconds for chunked long-form transcription. "
            "Applicable when transcribing audio longer than the model's receptive field (e.g., 30 seconds)."
        ),
    )
    use_sequential: Optional[bool] = Field(
        default=None,
        title="Use Sequential Algorithm",
        description=(
            "Whether to use the sequential long-form algorithm instead of chunked. "
            "Use `True` for higher accuracy on long audio files."
        ),
    )

    RETURN_TYPES: ClassVar[Tuple[str,]] = ("TEXT",)
    FUNCTION: ClassVar[str] = "process"

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
        logger.info("Initializing Whisper model...")
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

        if self.task == Whisper.Task.TRANSCRIBE:
            pipeline_task = "automatic-speech-recognition"
        elif self.task == Whisper.Task.TRANSLATE:
            pipeline_task = "translation"
        else:
            pipeline_task = "automatic-speech-recognition"

        self._pipeline = await self.load_pipeline(
            context=context,
            pipeline_task=pipeline_task,
            model_id=model,
            tokenizer=processor.tokenizer,
            feature_extractor=processor.feature_extractor,
            torch_dtype=torch_dtype,
            device=context.device,
        )

        logger.info("Whisper model initialized successfully.")

    async def move_to_device(self, device: str):
        assert self._pipeline
        self._pipeline.model.to(device)
        logger.info(f"Moved Whisper model to device: {device}")

    async def process(self, context: ProcessingContext) -> str:
        """
        Processes the input audio and returns the transcribed text.

        Returns:
            Transcribed text (str)
        """
        assert self._pipeline

        try:
            logger.info("Starting audio processing...")

            samples, _, _ = await context.audio_to_numpy(self.audio, sample_rate=16_000)

            pipeline_kwargs = {}

            if self.language:
                pipeline_kwargs["language"] = self.language

            if self.chunk_length_s is not None:
                pipeline_kwargs["chunk_length_s"] = self.chunk_length_s

            if self.use_sequential is not None:
                pipeline_kwargs["use_sequential"] = self.use_sequential

            result = self._pipeline(samples, **pipeline_kwargs)

            if isinstance(result, list):
                if not result:
                    logger.warning("Pipeline returned an empty list.")
                    return ""
                result = result[0]

            text = result.get("text", "")
            logger.info("Audio processing completed successfully.")
            return text  
        except Exception as e:
            logger.error(f"Error during audio processing: {e}")
            return ""
