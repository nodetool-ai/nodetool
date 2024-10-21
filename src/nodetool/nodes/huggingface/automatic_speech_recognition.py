import datetime
import torch
import logging
from nodetool.metadata.types import (
    AudioRef,
    AudioChunk,
    HFAutomaticSpeechRecognition,
    HuggingFaceModel,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext

from pydantic import Field
from typing import Optional, Tuple, ClassVar, List
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
    asr, automatic-speech-recognition, speech-to-text, translate, transcribe, audio, huggingface

    **Use Cases:**
    - Voice input for a chatbot
    - Transcribe or translate audio files
    - Create subtitles for videos

    **Features:**
    - Multilingual speech recognition
    - Speech translation
    - Language identification
    
    **Note**
    - Language selection is sorted by word error rate in the FLEURS benchmark
    - There are many variants of Whisper that are optimized for different use cases.

    **Links:**
    - https://github.com/openai/whisper
    - https://platform.openai.com/docs/guides/speech-to-text/supported-languages
    """

    class Task(str, Enum):
        TRANSCRIBE = "transcribe"
        TRANSLATE = "translate"

    class Timestamps(str, Enum):
        NONE = "none"
        WORD = "word"
        SENTENCE = "sentence"

    class WhisperLanguage(str, Enum):
        NONE = "auto_detect"
        SPANISH = "spanish"
        ITALIAN = "italian"
        KOREAN = "korean"
        PORTUGUESE = "portuguese"
        ENGLISH = "english"
        JAPANESE = "japanese"
        GERMAN = "german"
        RUSSIAN = "russian"
        DUTCH = "dutch"
        POLISH = "polish"
        CATALAN = "catalan"
        FRENCH = "french"
        INDONESIAN = "indonesian"
        UKRAINIAN = "ukrainian"
        TURKISH = "turkish"
        MALAY = "malay"
        SWEDISH = "swedish"
        MANDARIN = "mandarin"
        FINNISH = "finnish"
        NORWEGIAN = "norwegian"
        ROMANIAN = "romanian"
        THAI = "thai"
        VIETNAMESE = "vietnamese"
        SLOVAK = "slovak"
        ARABIC = "arabic"
        CZECH = "czech"
        CROATIAN = "croatian"
        GREEK = "greek"
        SERBIAN = "serbian"
        DANISH = "danish"
        BULGARIAN = "bulgarian"
        HUNGARIAN = "hungarian"
        FILIPINO = "filipino"
        BOSNIAN = "bosnian"
        GALICIAN = "galician"
        MACEDONIAN = "macedonian"
        HINDI = "hindi"
        ESTONIAN = "estonian"
        SLOVENIAN = "slovenian"
        TAMIL = "tamil"
        LATVIAN = "latvian"
        AZERBAIJANI = "azerbaijani"
        URDU = "urdu"
        LITHUANIAN = "lithuanian"
        HEBREW = "hebrew"
        WELSH = "welsh"
        PERSIAN = "persian"
        ICELANDIC = "icelandic"
        KAZAKH = "kazakh"
        AFRIKAANS = "afrikaans"
        KANNADA = "kannada"
        MARATHI = "marathi"
        SWAHILI = "swahili"
        TELUGU = "telugu"
        MAORI = "maori"
        NEPALI = "nepali"
        ARMENIAN = "armenian"
        BELARUSIAN = "belarusian"
        GUJARATI = "gujarati"
        PUNJABI = "punjabi"
        BENGALI = "bengali"

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

    task: Task = Field(
        default=Task.TRANSCRIBE,
        title="Task",
        description="The task to perform: 'transcribe' for speech-to-text or 'translate' for speech translation.",
    )
    language: WhisperLanguage = Field(
        default=WhisperLanguage.NONE,
        title="Language",
        description="The language of the input audio. If not specified, the model will attempt to detect it automatically.",
    )
    chunk_length_s: Optional[float] = Field(
        default=30,
        title="Chunk Length (seconds)",
        description=(
            "Length of each audio chunk in seconds for chunked long-form transcription. "
            "Applicable when transcribing audio longer than the model's receptive field (e.g., 30 seconds)."
        ),
    )
    timestamps: Timestamps = Field(
        default=Timestamps.NONE,
        title="Timestamps",
        description="The type of timestamps to return for the generated text.",
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
            HFAutomaticSpeechRecognition(
                repo_id="Systran/faster-whisper-large-v3",
                allow_patterns=["model.bin", "*.json", "*.txt"],
            ),
        ]

    @classmethod
    def return_type(cls):
        return {
            "text": str,
            "chunks": list[AudioChunk],
        }

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
            chunk_length_s=self.chunk_length_s,
            torch_dtype=torch_dtype,
            device=context.device,
        )  # type: ignore

        logger.info("Whisper model initialized successfully.")

    async def move_to_device(self, device: str):
        assert self._pipeline
        self._pipeline.model.to(device)  # type: ignore
        logger.info(f"Moved Whisper model to device: {device}")

    async def process(self, context: ProcessingContext):
        """
        Processes the input audio and returns the transcribed text.

        Returns:
            Transcribed text (str)
        """
        assert self._pipeline

        logger.info("Starting audio processing...")

        samples, _, _ = await context.audio_to_numpy(self.audio, sample_rate=16_000)

        pipeline_kwargs = {
            "return_timestamps": (
                False if self.timestamps == self.Timestamps.NONE else
                True if self.timestamps == self.Timestamps.SENTENCE else "word"
            ),
            "generate_kwargs": {
                "language": (
                    None if self.language.value == "auto_detect" else self.language.value
                ),
            },
        }

        result = self._pipeline(samples, **pipeline_kwargs)

        assert isinstance(result, dict)

        text = result.get("text", "")
        
        chunks = []
        if self.timestamps != self.Timestamps.NONE:
            for chunk in result.get("chunks", []):
                try:
                    timestamp = chunk.get("timestamp")
                    if timestamp and len(timestamp) == 2 and all(isinstance(t, (int, float)) for t in timestamp):
                        chunks.append(AudioChunk(
                            timestamp=timestamp,
                            text=chunk.get("text", "")
                        ))
                except ValueError as e:
                    logger.warning(f"Skipping invalid chunk: {e}")

        logger.info("Audio processing completed successfully.")
        return {
            "text": text,
            "chunks": chunks,
        }


class ChunksToSRT(BaseNode):
    """
    Convert audio chunks to SRT (SubRip Subtitle) format
    subtitle, srt, whisper, transcription

    **Use Cases:**
    - Generate subtitles for videos
    - Create closed captions from audio transcriptions
    - Convert speech-to-text output to a standardized subtitle format

    **Features:**
    - Converts Whisper audio chunks to SRT format
    - Supports customizable time offset
    - Generates properly formatted SRT file content
    """

    chunks: List[AudioChunk] = Field(
        default=[],
        title="Audio Chunks",
        description="List of audio chunks from Whisper transcription",
    )

    time_offset: float = Field(
        default=0.0,
        title="Time Offset",
        description="Time offset in seconds to apply to all timestamps",
    )

    def required_inputs(self):
        return ["chunks"]

    def _format_time(self, seconds: float) -> str:
        time = datetime.timedelta(seconds=seconds)
        return (datetime.datetime.min + time).strftime("%H:%M:%S,%f")[:-3]

    async def process(self, context: ProcessingContext) -> str:
        srt_lines = []
        for index, chunk in enumerate(self.chunks, start=1):
            start_time = chunk.timestamp[0] + self.time_offset
            end_time = chunk.timestamp[1] + self.time_offset

            srt_lines.extend(
                [
                    f"{index}",
                    f"{self._format_time(start_time)} --> {self._format_time(end_time)}",
                    f"{chunk.text.strip()}",
                    "",
                ]
            )

        return "\n".join(srt_lines)
