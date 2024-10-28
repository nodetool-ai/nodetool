import torch
from nodetool.metadata.types import (
    AudioRef,
    HFTextToAudio,
    HFTextToSpeech,
    HuggingFaceModel,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from diffusers.pipelines.audioldm2.pipeline_audioldm2 import AudioLDM2Pipeline
from diffusers.pipelines.audioldm.pipeline_audioldm import AudioLDMPipeline
from diffusers.pipelines.pipeline_utils import DiffusionPipeline
from diffusers.pipelines.musicldm.pipeline_musicldm import MusicLDMPipeline
from diffusers.pipelines.stable_audio.pipeline_stable_audio import StableAudioPipeline


from pydantic import Field
from transformers import AutoProcessor, MusicgenForConditionalGeneration
from parler_tts import ParlerTTSForConditionalGeneration
from transformers import AutoTokenizer
import torchaudio
from transformers import AutoFeatureExtractor, set_seed

from nodetool.workflows.types import NodeProgress
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
import re
import numpy as np


class MusicGen(HuggingFacePipelineNode):
    """
    Generates audio (music or sound effects) from text descriptions.
    audio, music, generation, huggingface

    Use cases:
    - Create custom background music for videos or games
    - Generate sound effects based on textual descriptions
    - Prototype musical ideas quickly
    """

    model: HFTextToAudio = Field(
        default=HFTextToAudio(),
        title="Model ID on Huggingface",
        description="The model ID to use for the audio generation",
    )
    prompt: str = Field(
        default="",
        title="Inputs",
        description="The input text to the model",
    )
    max_new_tokens: int = Field(
        default=256,
        title="Max New Tokens",
        description="The maximum number of tokens to generate",
    )

    _processor: AutoProcessor | None = None
    _model: MusicgenForConditionalGeneration | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFTextToAudio(
                repo_id="facebook/musicgen-small",
                allow_patterns=["*.safetensors", "*.json", "*.model"],
            ),
            HFTextToAudio(
                repo_id="facebook/musicgen-medium",
                allow_patterns=["*.safetensors", "*.json", "*.model"],
            ),
            HFTextToAudio(
                repo_id="facebook/musicgen-large",
                allow_patterns=["*.safetensors", "*.json", "*.model"],
            ),
            HFTextToAudio(
                repo_id="facebook/musicgen-melody",
                allow_patterns=["*.safetensors", "*.json", "*.model"],
            ),
            HFTextToAudio(
                repo_id="facebook/musicgen-stereo-small",
                allow_patterns=["*.safetensors", "*.json", "*.model"],
            ),
            HFTextToAudio(
                repo_id="facebook/musicgen-stereo-large",
                allow_patterns=["*.safetensors", "*.json", "*.model"],
            ),
        ]

    def get_model_id(self):
        return self.model.repo_id

    async def initialize(self, context: ProcessingContext):
        if not context.is_huggingface_model_cached(self.model.repo_id):
            raise ValueError(f"Download the model {self.model.repo_id} first")

        self._processor = await self.load_model(context, AutoProcessor, self.model.repo_id)  # type: ignore
        self._model = await self.load_model(  # type: ignore
            context=context,
            model_class=MusicgenForConditionalGeneration,
            model_id=self.model.repo_id,
            variant=None,
        )

    async def move_to_device(self, device: str):
        if self._model is not None:
            self._model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> AudioRef:  # type: ignore
        if self._model is None:
            raise ValueError("Model not initialized")

        inputs = self._processor(
            text=[self.prompt],
            padding=True,
            return_tensors="pt",
        )  # type: ignore

        inputs["input_ids"] = inputs["input_ids"].to(context.device)
        inputs["attention_mask"] = inputs["attention_mask"].to(context.device)

        audio_values = self._model.generate(
            **inputs, max_new_tokens=self.max_new_tokens
        )
        sampling_rate = self._model.config.audio_encoder.sampling_rate

        return await context.audio_from_numpy(
            audio_values[0].cpu().numpy(), sampling_rate
        )


class MusicLDM(HuggingFacePipelineNode):
    """
    Generates audio (music or sound effects) from text descriptions.
    audio, music, generation, huggingface

    Use cases:
    - Create custom background music for videos or games
    - Generate sound effects based on textual descriptions
    - Prototype musical ideas quickly
    """

    model: HFTextToAudio = Field(
        default=HFTextToAudio(),
        title="Model ID on Huggingface",
        description="The model ID to use for the audio generation",
    )

    prompt: str = Field(
        default="",
        title="Inputs",
        description="The input text to the model",
    )
    num_inference_steps: int = Field(
        default=10,
        title="Number of Inference Steps",
        description="The number of inference steps to use for the generation",
    )
    audio_length_in_s: float = Field(
        default=5.0,
        title="Audio Length",
        description="The length of the generated audio in seconds",
    )

    _pipeline: MusicLDMPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFTextToAudio(
                repo_id="ucsd-reach/musicldm",
                allow_patterns=["*.safetensors", "*.json", "*.txt"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context, MusicLDMPipeline, self.model.repo_id
        )

    async def move_to_device(self, device: str):
        if self._pipeline:
            self._pipeline.to(device)

    async def process(self, context: ProcessingContext) -> AudioRef:
        assert self._pipeline is not None, "Pipeline not initialized"
        audio = self._pipeline(
            self.prompt,
            num_inference_steps=self.num_inference_steps,
            audio_length_in_s=self.audio_length_in_s,
        ).audios[  # type: ignore
            0
        ]

        return await context.audio_from_numpy(audio, 16_000)


class AudioLDM(HuggingFacePipelineNode):
    """
    Generates audio using the AudioLDM model based on text prompts.
    audio, generation, AI, text-to-audio

    Use cases:
    - Create custom music or sound effects from text descriptions
    - Generate background audio for videos, games, or other media
    - Produce audio content for creative projects
    - Explore AI-generated audio for music production or sound design
    """

    prompt: str = Field(
        default="Techno music with a strong, upbeat tempo and high melodic riffs",
        description="A text prompt describing the desired audio.",
    )
    num_inference_steps: int = Field(
        default=10,
        description="Number of denoising steps. More steps generally improve quality but increase generation time.",
        ge=1,
        le=100,
    )
    audio_length_in_s: float = Field(
        default=5.0,
        description="The desired duration of the generated audio in seconds.",
        ge=1.0,
        le=30.0,
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: AudioLDMPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFTextToAudio(
                repo_id="cvssp/audioldm-s-full-v2",
                allow_patterns=["*.safetensors", "*.json", "*.txt"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context, AudioLDMPipeline, "cvssp/audioldm-s-full-v2"
        )

    async def process(self, context: ProcessingContext) -> AudioRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

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
            num_inference_steps=self.num_inference_steps,
            audio_length_in_s=self.audio_length_in_s,
            generator=generator,
            callback=progress_callback,  # type: ignore
            callback_steps=1,
        ).audios[  # type: ignore
            0
        ]

        return await context.audio_from_numpy(audio, 16000)


class AudioLDM2(HuggingFacePipelineNode):
    """
    Generates audio using the AudioLDM2 model based on text prompts.
    audio, generation, AI, text-to-audio

    Use cases:
    - Create custom sound effects based on textual descriptions
    - Generate background audio for videos or games
    - Produce audio content for multimedia projects
    - Explore AI-generated audio for creative sound design
    """

    prompt: str = Field(
        default="The sound of a hammer hitting a wooden surface.",
        description="A text prompt describing the desired audio.",
    )
    negative_prompt: str = Field(
        default="Low quality.",
        description="A text prompt describing what you don't want in the audio.",
    )
    num_inference_steps: int = Field(
        default=200,
        description="Number of denoising steps. More steps generally improve quality but increase generation time.",
        ge=50,
        le=500,
    )
    audio_length_in_s: float = Field(
        default=10.0,
        description="The desired duration of the generated audio in seconds.",
        ge=1.0,
        le=30.0,
    )
    num_waveforms_per_prompt: int = Field(
        default=3,
        description="Number of audio samples to generate per prompt.",
        ge=1,
        le=5,
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: AudioLDM2Pipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFTextToAudio(
                repo_id="cvssp/audioldm2",
                allow_patterns=["*.safetensors", "*.json", "*.txt"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context, AudioLDM2Pipeline, "cvssp/audioldm2", variant=None
        )

    async def process(self, context: ProcessingContext) -> AudioRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

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
            audio_length_in_s=self.audio_length_in_s,
            num_waveforms_per_prompt=self.num_waveforms_per_prompt,
            generator=generator,
            callback=progress_callback,  # type: ignore
            callback_steps=1,
        ).audios[  # type: ignore
            0
        ]

        return await context.audio_from_numpy(audio, 16000)


class DanceDiffusion(HuggingFacePipelineNode):
    """
    Generates audio using the DanceDiffusion model.
    audio, generation, AI, music

    Use cases:
    - Create AI-generated music samples
    - Produce background music for videos or games
    - Generate audio content for creative projects
    - Explore AI-composed musical ideas
    """

    audio_length_in_s: float = Field(
        default=4.0,
        description="The desired duration of the generated audio in seconds.",
        ge=1.0,
        le=30.0,
    )
    num_inference_steps: int = Field(
        default=50,
        description="Number of denoising steps. More steps generally improve quality but increase generation time.",
        ge=1,
        le=1000,
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _pipeline: DiffusionPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFTextToAudio(
                repo_id="harmonai/maestro-150k",
                allow_patterns=["*.bin", "*.json", "*.txt"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context, DiffusionPipeline, "harmonai/maestro-150k"
        )

    async def process(self, context: ProcessingContext) -> AudioRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = torch.Generator(device="cpu")
        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

        audio = self._pipeline(
            audio_length_in_s=self.audio_length_in_s,
            num_inference_steps=self.num_inference_steps,
            generator=generator,
        ).audios[  # type: ignore
            0
        ]

        return await context.audio_from_numpy(audio, 16000)


class StableAudioNode(HuggingFacePipelineNode):
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

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFTextToAudio(
                repo_id="stabilityai/stable-audio-open-1.0",
                allow_patterns=["*.safetensors", "*.json", "*.txt"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context, StableAudioPipeline, "stabilityai/stable-audio-open-1.0"
        )

    async def process(self, context: ProcessingContext) -> AudioRef:
        if self._pipeline is None:
            raise ValueError("Pipeline not initialized")

        generator = torch.Generator(device="cpu")

        if self.seed != -1:
            generator = generator.manual_seed(self.seed)

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
            callback=progress_callback,  # type: ignore
        ).audios[  # type: ignore
            0
        ]

        output = audio.T.float().cpu().numpy()
        sampling_rate = self._pipeline.vae.sampling_rate
        audio = await context.audio_from_numpy(output, sampling_rate)
        return audio


class ParlerTTSNode(HuggingFacePipelineNode):
    """
    Generates speech using the Parler TTS model based on a text prompt and description.
    audio, generation, AI, text-to-speech, TTS

    Use cases:
    - Generate natural-sounding speech from text
    - Create voiceovers for videos or presentations
    - Produce audio content for accessibility purposes
    - Explore AI-generated speech with customizable characteristics
    """

    model: HFTextToSpeech = Field(
        default=HFTextToSpeech(),
        title="Model ID on Huggingface",
        description="The model ID to use for the audio generation, must be a Parler TTS model",
    )

    prompt: str = Field(
        default="Hello, how are you doing today?",
        description="The text to be converted to speech.",
    )
    description: str = Field(
        default="A female speaker delivers a slightly expressive and animated speech with a moderate speed and pitch. The recording is of very high quality, with the speaker's voice sounding clear and very close up.",
        description="A description of the desired speech characteristics.",
    )
    reference_audio: AudioRef | None = Field(
        default=None,
        description="Optional reference audio file for voice cloning",
    )
    reference_text: str | None = Field(
        default=None,
        description="Transcript of the reference audio for voice cloning",
    )
    max_length: int = Field(
        default=512,
        description="The maximum length of the input text",
    )
    seed: int = Field(
        default=0,
        description="Seed for the random number generator. Use -1 for a random seed.",
        ge=-1,
    )

    _model: ParlerTTSForConditionalGeneration | None = None
    _tokenizer: AutoTokenizer | None = None
    _feature_extractor: AutoFeatureExtractor | None = None

    @classmethod
    def get_title(cls) -> str:
        return "Parler TTS"

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFTextToSpeech(
                repo_id="parler-tts/parler-tts-mini-v1",
                allow_patterns=["*.bin", "*.json", "*.txt"],
            ),
            HFTextToSpeech(
                repo_id="parler-tts/parler-tts-large-v1",
                allow_patterns=["*.bin", "*.json", "*.txt"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._model = await self.load_model(
            context=context,
            model_class=ParlerTTSForConditionalGeneration,
            model_id=self.model.repo_id,
            variant=None,
            torch_dtype=None,
        )
        self._tokenizer = await self.load_model(
            context, AutoTokenizer, self.model.repo_id
        )
        self._feature_extractor = await self.load_model(
            context, AutoFeatureExtractor, self.model.repo_id
        )

    async def move_to_device(self, device: str):
        if self._model is not None:
            self._model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> AudioRef:
        if (
            self._model is None
            or self._tokenizer is None
            or self._feature_extractor is None
        ):
            raise ValueError("Model, tokenizer, or feature extractor not initialized")

        # Set seeds for reproducibility
        if self.seed != -1:
            set_seed(self.seed)
            torch.manual_seed(self.seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed(self.seed)
                torch.cuda.manual_seed_all(self.seed)
            torch.backends.cudnn.deterministic = True
            torch.backends.cudnn.benchmark = False

        sampling_rate = self._model.config.sampling_rate

        # Prepare input IDs for the description
        input_ids = self._tokenizer(
            self.description,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=self.max_length,
        ).input_ids.to(  # type: ignore
            context.device
        )

        # Handle voice cloning if reference audio is provided
        input_values = None
        if self.reference_audio is not None and self.reference_text is not None:
            # Load and preprocess reference audio
            ref_audio, ref_sample_rate, num_channels = await context.audio_to_numpy(
                self.reference_audio
            )
            ref_audio_tensor = torch.from_numpy(ref_audio).float()
            if num_channels > 1:
                ref_audio_tensor = ref_audio_tensor.mean(0)

            # Resample if necessary
            if ref_sample_rate != sampling_rate:
                ref_audio_tensor = torchaudio.functional.resample(
                    ref_audio_tensor, ref_sample_rate, sampling_rate
                )

            # Process reference audio
            input_values = self._feature_extractor(
                ref_audio_tensor,
                sampling_rate=sampling_rate,
                return_tensors="pt",
                padding=True,
                max_length=self.max_length,
            ).input_values.to(  # type: ignore
                context.device
            )

        # Process the full prompt in a single pass
        prompt_input_ids = self._tokenizer(
            self.prompt,
            return_tensors="pt",
            padding=True,
            truncation=True,
            max_length=self.max_length,
        ).input_ids.to(  # type: ignore
            context.device
        )

        gen_kwargs = {
            "input_ids": input_ids,
            "prompt_input_ids": prompt_input_ids,
            # "max_new_tokens": 1000,
        }

        if input_values is not None:
            gen_kwargs["input_values"] = input_values

        with torch.inference_mode():
            generation = self._model.generate(**gen_kwargs)
            audio_arr = generation.cpu().numpy().squeeze()  # type: ignore

        return await context.audio_from_numpy(audio_arr, sampling_rate)
