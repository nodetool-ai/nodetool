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

    class Timestamps(str, Enum):
        WORD = "word"
        SENTENCE = "sentence"

    class WhisperLanguage(str, Enum):
        NONE = "none"
        ENGLISH = "english"
        CHINESE = "chinese"
        GERMAN = "german"
        SPANISH = "spanish"
        RUSSIAN = "russian"
        KOREAN = "korean"
        FRENCH = "french"
        JAPANESE = "japanese"
        PORTUGUESE = "portuguese"
        TURKISH = "turkish"
        POLISH = "polish"
        CATALAN = "catalan"
        DUTCH = "dutch"
        ARABIC = "arabic"
        SWEDISH = "swedish"
        ITALIAN = "italian"
        INDONESIAN = "indonesian"
        HINDI = "hindi"
        FINNISH = "finnish"
        VIETNAMESE = "vietnamese"
        HEBREW = "hebrew"
        UKRAINIAN = "ukrainian"
        GREEK = "greek"
        MALAY = "malay"
        CZECH = "czech"
        ROMANIAN = "romanian"
        DANISH = "danish"
        HUNGARIAN = "hungarian"
        TAMIL = "tamil"
        NORWEGIAN = "norwegian"
        THAI = "thai"
        URDU = "urdu"
        CROATIAN = "croatian"
        BULGARIAN = "bulgarian"
        LITHUANIAN = "lithuanian"
        LATIN = "latin"
        MAORI = "maori"
        MALAYALAM = "malayalam"
        WELSH = "welsh"
        SLOVAK = "slovak"
        TELUGU = "telugu"
        PERSIAN = "persian"
        LATVIAN = "latvian"
        BENGALI = "bengali"
        SERBIAN = "serbian"
        AZERBAIJANI = "azerbaijani"
        SLOVENIAN = "slovenian"
        KANNADA = "kannada"
        ESTONIAN = "estonian"
        MACEDONIAN = "macedonian"
        BRETON = "breton"
        BASQUE = "basque"
        ICELANDIC = "icelandic"
        ARMENIAN = "armenian"
        NEPALI = "nepali"
        MONGOLIAN = "mongolian"
        BOSNIAN = "bosnian"
        KAZAKH = "kazakh"
        ALBANIAN = "albanian"
        SWAHILI = "swahili"
        GALICIAN = "galician"
        MARATHI = "marathi"
        PUNJABI = "punjabi"
        SINHALA = "sinhala"
        KHMER = "khmer"
        SHONA = "shona"
        YORUBA = "yoruba"
        SOMALI = "somali"
        AFRIKAANS = "afrikaans"
        OCCITAN = "occitan"
        GEORGIAN = "georgian"
        BELARUSIAN = "belarusian"
        TAJIK = "tajik"
        SINDHI = "sindhi"
        GUJARATI = "gujarati"
        AMHARIC = "amharic"
        YIDDISH = "yiddish"
        LAO = "lao"
        UZBEK = "uzbek"
        FAROESE = "faroese"
        HAITIAN_CREOLE = "haitian creole"
        PASHTO = "pashto"
        TURKMEN = "turkmen"
        NYNORSK = "nynorsk"
        MALTESE = "maltese"
        SANSKRIT = "sanskrit"
        LUXEMBOURGISH = "luxembourgish"
        MYANMAR = "myanmar"
        TIBETAN = "tibetan"
        TAGALOG = "tagalog"
        MALAGASY = "malagasy"
        ASSAMESE = "assamese"
        TATAR = "tatar"
        HAWAIIAN = "hawaiian"
        LINGALA = "lingala"
        HAUSA = "hausa"
        BASHKIR = "bashkir"
        JAVANESE = "javanese"
        SUNDANESE = "sundanese"
        CANTONESE = "cantonese"
        BURMESE = "burmese"
        VALENCIAN = "valencian"
        FLEMISH = "flemish"
        HAITIAN = "haitian"
        LETZEBURGESCH = "letzeburgesch"
        PUSHTO = "pushto"
        PANJABI = "panjabi"
        MOLDAVIAN = "moldavian"
        MOLDOVAN = "moldovan"
        SINHALESE = "sinhalese"
        CASTILIAN = "castilian"
        MANDARIN = "mandarin"

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
        description="The language of the input audio. If not specified, the model will attempt to detect it automatically. example: spanish, italian, dutch, korean, german, french",
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
        default=Timestamps.SENTENCE,
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
                True if self.timestamps == self.Timestamps.SENTENCE else "word"
            ),
            "generate_kwargs": {
                "language": (
                    None if self.language.value == "none" else self.language.value
                ),
            },
        }

        result = self._pipeline(samples, **pipeline_kwargs)

        assert isinstance(result, dict)

        text = result.get("text", "")
        chunks = [
            AudioChunk(timestamp=chunk.get("timestamp"), text=chunk.get("text"))
            for chunk in result.get("chunks", [])
        ]

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
