from enum import Enum
import pydub
from typing import Any, Optional, Type, Literal
from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.nodes.replicate import ReplicateNode
from nodetool.workflows.processing_context import ProcessingContext


class RiffusionNode(ReplicateNode):
    """
    Generates novel music by transforming text prompts into audio through a spectrogram-based diffusion model.
    music, generate,synthesis
    Produces an audio file that reflects the transition between conceptual themes described in the input prompts, creating a unique musical piece.
    """

    class SeedImageId(Enum):
        AGILE = "agile"
        MARIM = "marim"
        MASK_BEAT_LINES_80 = "mask_beat_lines_80"
        MASK_GRADIENT_DARK = "mask_gradient_dark"
        MASK_GRADIENT_TOP_70 = "mask_gradient_top_70"
        MASK_GRAIDENT_TOP_FIFTH_75 = "mask_graident_top_fifth_75"
        MASK_TOP_THIRD_75 = "mask_top_third_75"
        MASK_TOP_THIRD_95 = "mask_top_third_95"
        MOTORWAY = "motorway"
        OG_BEAT = "og_beat"
        VIBES = "vibes"

    prompt_a: str = Field(
        default="funky synth solo", description="The prompt for your audio"
    )
    denoising: float = Field(
        default=0.75,
        ge=0.0,
        le=1.0,
        description="How much to transform input spectrogram",
    )
    prompt_b: str = Field(
        default="",
        description="The second prompt to interpolate with the first, leave blank if no interpolation",
    )
    alpha: float = Field(
        default=0.5,
        ge=0.0,
        le=1.0,
        description="Interpolation alpha if using two prompts. A value of 0 uses prompt_a fully, a value of 1 uses prompt_b fully",
    )
    num_inference_steps: int = Field(
        default=50, ge=1, description="Number of steps to run the diffusion model"
    )
    seed_image_id: SeedImageId = Field(
        default=SeedImageId.AGILE,
        description="The seed image to use for the diffusion model",
    )

    def replicate_model_id(self):
        return "riffusion/riffusion:8cf61ea6c56afd61d8f5b9ffd14d7c216c0a93844ce2d82ac1c9ecc9c7f24e05"

    @classmethod
    def return_type(cls):
        return AudioRef

    async def convert_output(
        self,
        context: ProcessingContext,
        value: Any,
    ):
        if value is None:
            return None
        uri = dict(value)["audio"]
        stream = await context.download_file_async(uri)
        audio = pydub.AudioSegment.from_file(stream)
        audio_ref = await context.audio_from_segment(audio)
        return {"output": audio_ref}


class MusicGenNode(ReplicateNode):
    """
    Generates music from a text prompt or input audio. Can create music from scratch or continue an existing audio file.
    music generation, audio synthesis, creativity
    Outputs audio influenced by provided text prompts or existing audio, incorporating specified model and normalization strategies.
    """

    class ModelVersion(str, Enum):
        MELODY = "melody"
        LARGE = "large"
        ENCODE_DECODE = "encode-decode"

    class NormalizationStrategy(str, Enum):
        LOUDNESS = "loudness"
        CLIP = "clip"
        PEAK = "peak"
        RMS = "rms"

    model_version: ModelVersion = Field(
        default=ModelVersion.MELODY,
        description="Model to use for generation. If set to 'encode-decode', the audio specified via 'input_audio' will simply be encoded and then decoded.",
    )
    prompt: str = Field(
        default="", description="A description of the music you want to generate."
    )
    input_audio: AudioRef = Field(
        default=AudioRef(),
        description="An audio file that will influence the generated music. If `continuation` is `True`, the generated music will be a continuation of the audio file. Otherwise, the generated music will mimic the audio file's melody.",
    )
    duration: int = Field(
        default=8, description="Duration of the generated audio in seconds."
    )
    continuation: bool = Field(
        default=False,
        description="If `True`, generated music will continue `melody`. Otherwise, generated music will mimic `audio_input`'s melody.",
    )
    continuation_start: Optional[int] = Field(
        default=None,
        description="Start time of the audio file to use for continuation.",
    )
    continuation_end: Optional[int] = Field(
        default=None,
        description="End time of the audio file to use for continuation. If -1 or None, will default to the end of the audio clip.",
    )
    normalization_strategy: NormalizationStrategy = Field(
        default=NormalizationStrategy.LOUDNESS,
        description="Strategy for normalizing audio.",
    )
    top_k: int = Field(
        default=250, description="Reduces sampling to the k most likely tokens."
    )
    top_p: float = Field(
        default=0,
        description="Reduces sampling to tokens with cumulative probability of p. When set to `0` (default), top_k sampling is used.",
    )
    temperature: float = Field(
        default=1.0,
        ge=0.5,
        le=1.5,
        description="Controls the 'conservativeness' of the sampling process. Higher temperature means more diversity.",
    )
    classifier_free_guidance: int = Field(
        default=3,
        description="Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs.",
    )
    seed: Optional[int] = Field(
        default=-1,
        description="Seed for random number generator. If None or -1, a random seed will be used.",
    )

    def replicate_model_id(self):
        return "meta/musicgen:7a76a8258b23fae65c5a22debb8841d1d7e816b75c2f24218cd2bd8573787906"

    async def extra_params(self, context: ProcessingContext):
        return {"output_format": "wav"}

    @classmethod
    def return_type(cls):
        return AudioRef

    async def convert_output(
        self,
        context: ProcessingContext,
        value: Any,
    ):
        if value is None:
            return None
        stream = await context.download_file_async(str(value))
        audio = pydub.AudioSegment.from_file(stream)
        audio_ref = await context.audio_from_segment(audio)
        return {"output": audio_ref}


class BarkNode(ReplicateNode):
    """
    Creates audio from text prompts, capable of simulating various accents or styles through audio cloning.
    audio, generate, tta, t2a, text-to-audio, clone, voice, speech, speak
    Generates a unique audio output, including speech and sounds, tailored to the specificities of the input text and chosen history prompt for style or accent.
    """

    class HistoryPromptEnum(str, Enum):
        ANNOUNCER = "announcer"
        DE_SPEAKER_0 = "de_speaker_0"
        DE_SPEAKER_1 = "de_speaker_1"
        DE_SPEAKER_2 = "de_speaker_2"
        DE_SPEAKER_3 = "de_speaker_3"
        DE_SPEAKER_4 = "de_speaker_4"
        DE_SPEAKER_5 = "de_speaker_5"
        DE_SPEAKER_6 = "de_speaker_6"
        DE_SPEAKER_7 = "de_speaker_7"
        DE_SPEAKER_8 = "de_speaker_8"
        DE_SPEAKER_9 = "de_speaker_9"
        EN_SPEAKER_0 = "en_speaker_0"
        EN_SPEAKER_1 = "en_speaker_1"
        EN_SPEAKER_2 = "en_speaker_2"
        EN_SPEAKER_3 = "en_speaker_3"
        EN_SPEAKER_4 = "en_speaker_4"
        EN_SPEAKER_5 = "en_speaker_5"
        EN_SPEAKER_6 = "en_speaker_6"
        EN_SPEAKER_7 = "en_speaker_7"
        EN_SPEAKER_8 = "en_speaker_8"
        EN_SPEAKER_9 = "en_speaker_9"
        ES_SPEAKER_0 = "es_speaker_0"
        ES_SPEAKER_1 = "es_speaker_1"
        ES_SPEAKER_2 = "es_speaker_2"
        ES_SPEAKER_3 = "es_speaker_3"
        ES_SPEAKER_4 = "es_speaker_4"
        ES_SPEAKER_5 = "es_speaker_5"
        ES_SPEAKER_6 = "es_speaker_6"
        ES_SPEAKER_7 = "es_speaker_7"
        ES_SPEAKER_8 = "es_speaker_8"
        ES_SPEAKER_9 = "es_speaker_9"
        FR_SPEAKER_0 = "fr_speaker_0"
        FR_SPEAKER_1 = "fr_speaker_1"
        FR_SPEAKER_2 = "fr_speaker_2"
        FR_SPEAKER_3 = "fr_speaker_3"
        FR_SPEAKER_4 = "fr_speaker_4"
        FR_SPEAKER_5 = "fr_speaker_5"
        FR_SPEAKER_6 = "fr_speaker_6"
        FR_SPEAKER_7 = "fr_speaker_7"
        FR_SPEAKER_8 = "fr_speaker_8"
        FR_SPEAKER_9 = "fr_speaker_9"
        HI_SPEAKER_0 = "hi_speaker_0"
        HI_SPEAKER_1 = "hi_speaker_1"
        HI_SPEAKER_2 = "hi_speaker_2"
        HI_SPEAKER_3 = "hi_speaker_3"
        HI_SPEAKER_4 = "hi_speaker_4"
        HI_SPEAKER_5 = "hi_speaker_5"
        HI_SPEAKER_6 = "hi_speaker_6"
        HI_SPEAKER_7 = "hi_speaker_7"
        HI_SPEAKER_8 = "hi_speaker_8"
        HI_SPEAKER_9 = "hi_speaker_9"
        IT_SPEAKER_0 = "it_speaker_0"
        IT_SPEAKER_1 = "it_speaker_1"
        IT_SPEAKER_2 = "it_speaker_2"
        IT_SPEAKER_3 = "it_speaker_3"
        IT_SPEAKER_4 = "it_speaker_4"
        IT_SPEAKER_5 = "it_speaker_5"
        IT_SPEAKER_6 = "it_speaker_6"
        IT_SPEAKER_7 = "it_speaker_7"
        IT_SPEAKER_8 = "it_speaker_8"
        IT_SPEAKER_9 = "it_speaker_9"
        JA_SPEAKER_0 = "ja_speaker_0"
        JA_SPEAKER_1 = "ja_speaker_1"
        JA_SPEAKER_2 = "ja_speaker_2"
        JA_SPEAKER_3 = "ja_speaker_3"
        JA_SPEAKER_4 = "ja_speaker_4"
        JA_SPEAKER_5 = "ja_speaker_5"
        JA_SPEAKER_6 = "ja_speaker_6"
        JA_SPEAKER_7 = "ja_speaker_7"
        JA_SPEAKER_8 = "ja_speaker_8"
        JA_SPEAKER_9 = "ja_speaker_9"
        KO_SPEAKER_0 = "ko_speaker_0"
        KO_SPEAKER_1 = "ko_speaker_1"
        KO_SPEAKER_2 = "ko_speaker_2"
        KO_SPEAKER_3 = "ko_speaker_3"
        KO_SPEAKER_4 = "ko_speaker_4"
        KO_SPEAKER_5 = "ko_speaker_5"
        KO_SPEAKER_6 = "ko_speaker_6"
        KO_SPEAKER_7 = "ko_speaker_7"
        KO_SPEAKER_8 = "ko_speaker_8"
        KO_SPEAKER_9 = "ko_speaker_9"
        PL_SPEAKER_0 = "pl_speaker_0"
        PL_SPEAKER_1 = "pl_speaker_1"
        PL_SPEAKER_2 = "pl_speaker_2"
        PL_SPEAKER_3 = "pl_speaker_3"
        PL_SPEAKER_4 = "pl_speaker_4"
        PL_SPEAKER_5 = "pl_speaker_5"
        PL_SPEAKER_6 = "pl_speaker_6"
        PL_SPEAKER_7 = "pl_speaker_7"
        PL_SPEAKER_8 = "pl_speaker_8"
        PL_SPEAKER_9 = "pl_speaker_9"
        PT_SPEAKER_0 = "pt_speaker_0"
        PT_SPEAKER_1 = "pt_speaker_1"
        PT_SPEAKER_2 = "pt_speaker_2"
        PT_SPEAKER_3 = "pt_speaker_3"
        PT_SPEAKER_4 = "pt_speaker_4"
        PT_SPEAKER_5 = "pt_speaker_5"
        PT_SPEAKER_6 = "pt_speaker_6"
        PT_SPEAKER_7 = "pt_speaker_7"
        PT_SPEAKER_8 = "pt_speaker_8"
        PT_SPEAKER_9 = "pt_speaker_9"
        RU_SPEAKER_0 = "ru_speaker_0"
        RU_SPEAKER_1 = "ru_speaker_1"
        RU_SPEAKER_2 = "ru_speaker_2"
        RU_SPEAKER_3 = "ru_speaker_3"
        RU_SPEAKER_4 = "ru_speaker_4"
        RU_SPEAKER_5 = "ru_speaker_5"
        RU_SPEAKER_6 = "ru_speaker_6"
        RU_SPEAKER_7 = "ru_speaker_7"
        RU_SPEAKER_8 = "ru_speaker_8"
        RU_SPEAKER_9 = "ru_speaker_9"
        TR_SPEAKER_0 = "tr_speaker_0"
        TR_SPEAKER_1 = "tr_speaker_1"
        TR_SPEAKER_2 = "tr_speaker_2"
        TR_SPEAKER_3 = "tr_speaker_3"
        TR_SPEAKER_4 = "tr_speaker_4"
        TR_SPEAKER_5 = "tr_speaker_5"
        TR_SPEAKER_6 = "tr_speaker_6"
        TR_SPEAKER_7 = "tr_speaker_7"
        TR_SPEAKER_8 = "tr_speaker_8"
        TR_SPEAKER_9 = "tr_speaker_9"
        ZH_SPEAKER_0 = "zh_speaker_0"
        ZH_SPEAKER_1 = "zh_speaker_1"
        ZH_SPEAKER_2 = "zh_speaker_2"
        ZH_SPEAKER_3 = "zh_speaker_3"
        ZH_SPEAKER_4 = "zh_speaker_4"
        ZH_SPEAKER_5 = "zh_speaker_5"
        ZH_SPEAKER_6 = "zh_speaker_6"
        ZH_SPEAKER_7 = "zh_speaker_7"
        ZH_SPEAKER_8 = "zh_speaker_8"
        ZH_SPEAKER_9 = "zh_speaker_9"

    prompt: str = Field(
        default="Hello, my name is Suno. And, uh — and I like pizza. [laughs] But I also have other interests such as playing tic tac toe.",
        description="Input prompt guiding the audio generation.",
    )
    history_prompt: HistoryPromptEnum = Field(
        default=HistoryPromptEnum.ANNOUNCER,
        description="Optional history choice for audio cloning.",
    )
    text_temp: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Temperature for text generation diversity.",
    )
    waveform_temp: float = Field(
        default=0.7,
        ge=0.0,
        le=1.0,
        description="Temperature for waveform generation diversity.",
    )

    def replicate_model_id(self) -> str:
        return "suno-ai/bark:b76242b40d67c76ab6742e987628a2a9ac019e11d56ab96c4e91ce03b79b2787"

    @classmethod
    def return_type(cls):
        return AudioRef

    async def convert_output(
        self,
        context: ProcessingContext,
        value: Any,
    ):
        if value is None:
            return None
        res = dict(value)
        uri = res["audio_out"]
        return {"output": AudioRef(uri=uri)}
