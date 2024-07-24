from typing import Any
from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import ImageRef
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from enum import Enum
from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext

class AudioClassifier(HuggingFacePipelineNode):
    """
    Classifies audio into predefined categories.
    audio, classification, labeling, categorization

    Use cases:
    - Classify music genres
    - Detect speech vs. non-speech audio
    - Identify environmental sounds
    - Emotion recognition in speech
    """

    class AudioClassifierModelId(str, Enum):
        MIT_AST_FINETUNED_AUDIOSET_10_10_0_BALANCED = "MIT/ast-finetuned-audioset-10-10-0.4593"
        EHCALABRES_WAV2VEC2_LG_XLSR_EN_SPEECH_EMOTION_RECOGNITION = "ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition"

    model: AudioClassifierModelId = Field(
        default=AudioClassifierModelId.MIT_AST_FINETUNED_AUDIOSET_10_10_0_BALANCED,
        title="Model ID on Huggingface",
        description="The model ID to use for audio classification",
    )
    inputs: AudioRef = Field(
        default=AudioRef(),
        title="Audio",
        description="The input audio to classify",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return 'audio-classification'

    async def get_inputs(self, context: ProcessingContext):
        samples, _, _ = await context.audio_to_numpy(self.inputs)
        return samples

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> dict[str, float]:
        return {item['label']: item['score'] for item in result}

    async def process_local_result(self, context: ProcessingContext, result: Any) -> dict[str, float]:
        return {item['label']: item['score'] for item in result}

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        return await super().process(context)


class TextToSpeech(HuggingFacePipelineNode):
    """
    Generates natural-sounding speech from text input.
    tts, audio, speech, huggingface

    Use cases:
    - Create voice content for apps and websites
    - Develop voice assistants with natural-sounding speech
    - Generate automated announcements for public spaces
    """

    class TTSModelId(str, Enum):
        FASTSPEECH2_EN_LJSPEECH = "facebook/fastspeech2-en-ljspeech"
        SUNO_BARK = "suno/bark"

    model: TTSModelId = Field(
        default=TTSModelId.SUNO_BARK,
        title="Model ID on Huggingface",
        description="The model ID to use for the image generation",
    )
    inputs: str = Field(
        default="",
        title="Inputs",
        description="The input text to the model",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return 'text-to-audio'

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> AudioRef:
        audio = await context.audio_from_bytes(result)  # type: ignore
        return audio

    async def process_local_result(self, context: ProcessingContext, result: Any) -> AudioRef:
        audio = await context.audio_from_bytes(result)  # type: ignore
        return audio
    
    async def process(self, context: ProcessingContext) -> dict[str, float]:
        return await super().process(context)


class TextToAudio(HuggingfaceNode):
    """
    Generates audio (music or sound effects) from text descriptions.
    audio, music, generation, huggingface

    Use cases:
    - Create custom background music for videos or games
    - Generate sound effects based on textual descriptions
    - Prototype musical ideas quickly
    """

    class TextToAudioModelId(str, Enum):
        MUSICGEN_SMALL = "facebook/musicgen-small"
        MUSICGEN_MEDIUM = "facebook/musicgen-medium"
        MUSICGEN_LARGE = "facebook/musicgen-large"
        MUSICGEN_MELODY = "facebook/musicgen-melody"
        MUSICGEN_STEREO_SMALL = "facebook/musicgen-stereo-small"
        MUSICGEN_STEREO_LARGE = "facebook/musicgen-stereo-large"

    model: TextToAudioModelId = Field(
        default=TextToAudioModelId.MUSICGEN_SMALL,
        title="Model ID on Huggingface",
        description="The model ID to use for the audio generation",
    )
    inputs: str = Field(
        default="",
        title="Inputs",
        description="The input text to the model",
    )

    def get_model_id(self):
        return self.model.value

    async def process(self, context: ProcessingContext) -> AudioRef:
        result = await self.run_huggingface(
            model_id=self.model.value,
            context=context,
            params={
                "inputs": self.inputs,
            },
        )
        audio = await context.audio_from_bytes(result)  # type: ignore
        return audio


class AutomaticSpeechRecognition(HuggingFacePipelineNode):
    """
    Transcribes spoken audio to text.
    asr, speech-to-text, audio, huggingface

    Use cases:
    - Transcribe interviews or meetings
    - Create subtitles for videos
    - Implement voice commands in applications
    """

    class ASRModelId(str, Enum):
        OPENAI_WHISPER_LARGE_V3 = "openai/whisper-large-v3"
        OPENAI_WHISPER_LARGE_V2 = "openai/whisper-large-v2"
        OPENAI_WHISPER_SMALL = "openai/whisper-small"

    model: ASRModelId = Field(
        default=ASRModelId.OPENAI_WHISPER_LARGE_V3,
        title="Model ID on Huggingface",
        description="The model ID to use for the speech recognition",
    )
    inputs: AudioRef = Field(
        default=AudioRef(),
        title="Image",
        description="The input audio to transcribe",
    )

    def get_model_id(self):
        return self.model.value
    
    @property
    def pipeline_task(self) -> str:
        return 'automatic-speech-recognition'

    async def process_remote_result(self, context: ProcessingContext, result: Any) -> AudioRef:
        return result["text"]

    async def process_local_result(self, context: ProcessingContext, result: Any) -> AudioRef:
        return result["text"]
    
    async def get_inputs(self, context: ProcessingContext):
        return await context.asset_to_io(self.inputs)