import base64
from enum import Enum
from io import BytesIO
from typing import IO, List, Optional
import fal_client
from pydantic import Field

from nodetool.metadata.types import AudioRef
from nodetool.nodes.fal.fal_node import FALNode
from nodetool.workflows.processing_context import ProcessingContext


class TaskEnum(str, Enum):
    TRANSCRIBE = "transcribe"
    TRANSLATE = "translate"


class ChunkLevelEnum(str, Enum):
    SEGMENT = "segment"
    WORD = "word"
    

class LanguageEnum(str, Enum):
    AF = "af"
    AM = "am"
    AR = "ar"
    AS = "as"
    AZ = "az"
    BA = "ba"
    BE = "be"
    BG = "bg"
    BN = "bn"
    BO = "bo"
    BR = "br"
    BS = "bs"
    CA = "ca"
    CS = "cs"
    CY = "cy"
    DA = "da"
    DE = "de"
    EL = "el"
    EN = "en"
    ES = "es"
    ET = "et"
    EU = "eu"
    FA = "fa"
    FI = "fi"
    FO = "fo"
    FR = "fr"
    GL = "gl"
    GU = "gu"
    HA = "ha"
    HAW = "haw"
    HE = "he"
    HI = "hi"
    HR = "hr"
    HT = "ht"
    HU = "hu"
    HY = "hy"
    ID = "id"
    IS = "is"
    IT = "it"
    JA = "ja"
    JW = "jw"
    KA = "ka"
    KK = "kk"
    KM = "km"
    KN = "kn"
    KO = "ko"
    LA = "la"
    LB = "lb"
    LN = "ln"
    LO = "lo"
    LT = "lt"
    LV = "lv"
    MG = "mg"
    MI = "mi"
    MK = "mk"
    ML = "ml"
    MN = "mn"
    MR = "mr"
    MS = "ms"
    MT = "mt"
    MY = "my"
    NE = "ne"
    NL = "nl"
    NN = "nn"
    NO = "no"
    OC = "oc"
    PA = "pa"
    PL = "pl"
    PS = "ps"
    PT = "pt"
    RO = "ro"
    RU = "ru"
    SA = "sa"
    SD = "sd"
    SI = "si"
    SK = "sk"
    SL = "sl"
    SN = "sn"
    SO = "so"
    SQ = "sq"
    SR = "sr"
    SU = "su"
    SV = "sv"
    SW = "sw"
    TA = "ta"
    TE = "te"
    TG = "tg"
    TH = "th"
    TK = "tk"
    TL = "tl"
    TR = "tr"
    TT = "tt"
    UK = "uk"
    UR = "ur"
    UZ = "uz"
    VI = "vi"
    YI = "yi"
    YO = "yo"
    YUE = "yue"
    ZH = "zh"



class Whisper(FALNode):
    """
    Whisper is a model for speech transcription and translation that can transcribe audio in multiple languages and optionally translate to English.
    speech, audio, transcription, translation, transcribe, translate, multilingual, speech-to-text, audio-to-text

    Use cases:
    - Transcribe spoken content to text
    - Translate speech to English
    - Generate subtitles and captions
    - Create text records of audio content
    - Analyze multilingual audio content
    """

    audio: AudioRef = Field(
        default=AudioRef(),
        description="The audio file to transcribe"
    )
    task: TaskEnum = Field(
        default=TaskEnum.TRANSCRIBE,
        description="Task to perform on the audio file"
    )
    language: LanguageEnum = Field(
        default=LanguageEnum.EN,
        description="Language of the audio file. If not set, will be auto-detected"
    )
    diarize: bool = Field(
        default=False,
        description="Whether to perform speaker diarization"
    )
    chunk_level: ChunkLevelEnum = Field(
        default=ChunkLevelEnum.SEGMENT,
        description="Level of detail for timestamp chunks"
    )
    num_speakers: int = Field(
        default=1,
        ge=1,
        le=10,
        description="Number of speakers in the audio. If not set, will be auto-detected"
    )
    batch_size: int = Field(
        default=64,
        description="Batch size for processing"
    )
    prompt: str = Field(
        default="",
        description="Optional prompt to guide the transcription"
    )
    
    @classmethod
    def return_type(cls):
        return {
            "text": str,
            "chunks": list[dict],
            "inferred_languages": list[str],
            "diarization_segments": list[dict]
        }

    async def process(self, context: ProcessingContext) -> dict:
        """
        Process the audio file using Whisper model.
        
        Returns:
            dict: Contains transcription text, chunks, and optionally diarization segments
        """
        client: fal_client.AsyncClient = self.get_client(context)
        audio_bytes = await context.asset_to_bytes(self.audio)
        audio_url = await client.upload(audio_bytes, "audio/mp3")
        
        arguments = {
            "audio_url": audio_url,
            "task": self.task.value,
            "chunk_level": self.chunk_level.value,
            "diarize": self.diarize,
            "batch_size": self.batch_size,
        }

        if self.prompt:
            arguments["prompt"] = self.prompt
        if self.language:
            arguments["language"] = self.language
        if self.num_speakers is not None:
            arguments["num_speakers"] = self.num_speakers

        result = await self.submit_request(
            context=context,
            application="fal-ai/whisper",
            arguments=arguments,
        )

        return {
            "text": result["text"],
            "chunks": result["chunks"],
            "inferred_languages": result["inferred_languages"],
            "diarization_segments": result.get("diarization_segments", [])
        }

    @classmethod
    def get_basic_fields(cls) -> List[str]:
        return ["audio", "task", "diarize"]
