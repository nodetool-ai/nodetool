from typing import Any
from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.metadata.types import ImageRef
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from enum import Enum
from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
import torch
from diffusers import StableAudioPipeline
from nodetool.workflows.types import NodeProgress


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
        MIT_AST_FINETUNED_AUDIOSET_10_10_0_BALANCED = (
            "MIT/ast-finetuned-audioset-10-10-0.4593"
        )
        EHCALABRES_WAV2VEC2_LG_XLSR_EN_SPEECH_EMOTION_RECOGNITION = (
            "ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition"
        )

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
        return "audio-classification"

    async def get_inputs(self, context: ProcessingContext):
        samples, _, _ = await context.audio_to_numpy(self.inputs)
        return samples

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {item["label"]: item["score"] for item in result}

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {item["label"]: item["score"] for item in result}

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
        return "text-to-audio"

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> AudioRef:
        audio = await context.audio_from_bytes(result)  # type: ignore
        return audio

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> AudioRef:
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
        # we need to run this remote as the model is too big to run locally
        result = await self.run_huggingface(
            model_id=self.model.value,
            context=context,
            params={
                "inputs": self.inputs,
            },
        )
        audio = await context.audio_from_bytes(result)  # type: ignore
        return audio


class StableAudioNode(BaseNode):
    """
    Generates audio using the Stable Audio Pipeline based on a text prompt.
    audio, generation, AI, text-to-audio

    Use cases:
    - Creating custom sound effects based on textual descriptions
    - Generating background audio for videos or games
    - Exploring AI-generated audio for creative projects
    """

    prompt: str = Field(
        default="A peaceful piano melody.",
        description="A text prompt describing the desired audio.",
    )
    negative_prompt: str = Field(
        default="Low quality.",
        description="A text prompt describing what you don't want in the audio.",
    )
    duration: float = Field(
        default=10.0,
        description="The desired duration of the generated audio in seconds.",
        ge=1.0,
        le=300.0,
    )
    num_inference_steps: int = Field(
        default=200,
        description="Number of denoising steps. More steps generally improve quality but increase generation time.",
        ge=50,
        le=500,
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: StableAudioPipeline | None = None

    async def initialize(self, context: ProcessingContext):
        self._pipeline = StableAudioPipeline.from_pretrained(
            "stabilityai/stable-audio-open-1.0",
            torch_dtype=torch.float16,
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> AudioRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = torch.Generator("cuda").manual_seed(0)

        def progress_callback(
            step: int, timestep: int, latents: torch.FloatTensor
        ) -> None:
            context.post_message(
                NodeProgress(
                    node_id=self.id,
                    progress=step,
                    total=self.num_inference_steps,
                )
            )

        audio = self._pipeline(
            self.prompt,
            negative_prompt=self.negative_prompt,
            num_inference_steps=self.num_inference_steps,
            audio_end_in_s=self.duration,
            num_waveforms_per_prompt=1,
            generator=generator,
            callback=progress_callback,
        ).audios[0]

        output = audio.T.float().cpu().numpy()
        sampling_rate = self._pipeline.vae.sampling_rate
        audio = await context.audio_from_numpy(output, sampling_rate)
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
        return await context.asset_to_io(self.inputs)


class ZeroShotAudioClassifier(HuggingFacePipelineNode):
    """
    Classifies audio into categories without the need for training data.
    audio, classification, labeling, categorization, zero-shot

    Use cases:
    - Quickly categorize audio without training data
    - Identify sounds or music genres without predefined labels
    - Automate audio tagging for large datasets
    """

    class ZeroShotAudioClassifierModelId(str, Enum):
        LAION_CLAP_HTSAT_UNFUSED = "laion/clap-htsat-unfused"

    model: ZeroShotAudioClassifierModelId = Field(
        default=ZeroShotAudioClassifierModelId.LAION_CLAP_HTSAT_UNFUSED,
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    inputs: AudioRef = Field(
        default=AudioRef(),
        title="Audio",
        description="The input audio to classify",
    )
    candidate_labels: str = Field(
        default="",
        title="Candidate Labels",
        description="The candidate labels to classify the audio against, separated by commas",
    )

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "zero-shot-audio-classification"

    def get_params(self):
        return {
            "candidate_labels": self.candidate_labels.split(","),
        }

    async def get_inputs(self, context: ProcessingContext):
        samples, _, _ = await context.audio_to_numpy(self.inputs)
        return samples

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {item["label"]: item["score"] for item in result}

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> dict[str, float]:
        return {item["label"]: item["score"] for item in result}

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        return await super().process(context)
