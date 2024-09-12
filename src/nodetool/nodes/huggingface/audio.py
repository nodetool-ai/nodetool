from typing import Any
from pydantic import Field
from nodetool.metadata.types import (
    AudioRef,
    HFAudioClassification,
    HFAutomaticSpeechRecognition,
    HFTextToAudio,
    HFTextToSpeech,
    HFZeroShotAudioClassification,
    HFZeroShotClassification,
    HuggingFaceModel,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import AudioRef
import torch
from diffusers import StableAudioPipeline  # type: ignore
from nodetool.workflows.types import NodeProgress
import torch
from transformers import pipeline, Pipeline
from transformers import AutoProcessor, MusicgenForConditionalGeneration
from diffusers import DiffusionPipeline  # type: ignore
from diffusers import MusicLDMPipeline  # type: ignore
from diffusers import AudioLDMPipeline  # type: ignore
from diffusers import AudioLDM2Pipeline  # type: ignore
from transformers import AudioClassificationPipeline  # type: ignore
from transformers import ZeroShotAudioClassificationPipeline  # type: ignore
from transformers import TextToAudioPipeline  # type: ignore


class AudioClassifier(HuggingFacePipelineNode):
    """
    Classifies audio into predefined categories.
    audio, classification, labeling, categorization

    Use cases:
    - Classify music genres
    - Detect speech vs. non-speech audio
    - Identify environmental sounds
    - Emotion recognition in speech

    Recommended models
    - MIT/ast-finetuned-audioset-10-10-0.4593
    - ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition
    """

    model: HFAudioClassification = Field(
        default=HFAudioClassification(),
        title="Model ID on Huggingface",
        description="The model ID to use for audio classification",
    )
    audio: AudioRef = Field(
        default=AudioRef(),
        title="Audio",
        description="The input audio to classify",
    )
    top_k: int = Field(
        default=10,
        title="Top K",
        description="The number of top results to return",
    )
    _pipeline: AudioClassificationPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFAudioClassification(
                repo_id="MIT/ast-finetuned-audioset-10-10-0.4593",
                allow_patterns=["*.safetensors", "*.json"],
            ),
            HFAudioClassification(
                repo_id="ehcalabres/wav2vec2-lg-xlsr-en-speech-emotion-recognition",
                allow_patterns=["pytorch_model.bin", "*.json"],
            ),
        ]

    def required_inputs(self):
        return ["inputs"]

    def get_torch_dtype(self):
        return torch.float32

    def get_model_id(self):
        return self.model.repo_id

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        samples, _, _ = await context.audio_to_numpy(self.inputs)
        result = self._pipeline(
            samples,
            top_k=self.top_k,
        )
        return {item["label"]: item["score"] for item in result}


class Bark(HuggingFacePipelineNode):
    """
    Bark is a text-to-audio model created by Suno. Bark can generate highly realistic, multilingual speech as well as other audio - including music, background noise and simple sound effects. The model can also produce nonverbal communications like laughing, sighing and crying.
    tts, audio, speech, huggingface

    Use cases:
    - Create voice content for apps and websites
    - Develop voice assistants with natural-sounding speech
    - Generate automated announcements for public spaces
    """

    model: HFTextToSpeech = Field(
        default=HFTextToSpeech(),
        title="Model ID on Huggingface",
        description="The model ID to use for the image generation",
    )
    prompt: str = Field(
        default="",
        title="Inputs",
        description="The input text to the model",
    )
    _pipeline: TextToAudioPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFTextToSpeech(
                repo_id="suno/bark",
                allow_patterns=["*.bin", "*.json", "*.txt"],
            ),
            HFTextToSpeech(
                repo_id="suno/bark-small",
                allow_patterns=["*.bin", "*.json", "*.txt"],
            ),
        ]

    def get_model_id(self):
        return self.model.repo_id

    async def move_to_device(self, device: str):
        pass

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, "text-to-speech", self.get_model_id(), device=context.device
        )

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        result = self._pipeline(self.prompt, forward_params={"do_sample": True})
        audio = await context.audio_from_numpy(result["audio"], 24_000)  # type: ignore
        return audio


class MusicGen(HuggingfaceNode):
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

        self._processor = self.load_model(context, AutoProcessor, self.model.repo_id)
        self._model = self.load_model(
            context, MusicgenForConditionalGeneration, self.model.repo_id
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

        audio_values = self._model.generate(**inputs, max_new_tokens=256)
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

    Recommended models:
    - ucsd-reach/musicldm
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
            context, AudioLDM2Pipeline, "cvssp/audioldm2"
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
        samples, _, _ = await context.audio_to_numpy(self.inputs)
        return samples


class ZeroShotAudioClassifier(HuggingFacePipelineNode):
    """
    Classifies audio into categories without the need for training data.
    audio, classification, labeling, categorization, zero-shot

    Use cases:
    - Quickly categorize audio without training data
    - Identify sounds or music genres without predefined labels
    - Automate audio tagging for large datasets
    """

    model: HFZeroShotAudioClassification = Field(
        default=HFZeroShotAudioClassification(),
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    audio: AudioRef = Field(
        default=AudioRef(),
        title="Audio",
        description="The input audio to classify",
    )
    candidate_labels: str = Field(
        default="",
        title="Candidate Labels",
        description="The candidate labels to classify the audio against, separated by commas",
    )

    _pipeline: ZeroShotAudioClassificationPipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFZeroShotAudioClassification(
                repo_id="laion/clap-htsat-unfused",
                allow_patterns=["model.safetensors", "*.json", "*.txt"],
            ),
        ]

    def required_inputs(self):
        return ["audio"]

    def get_model_id(self):
        return self.model.repo_id

    @property
    def pipeline_task(self) -> str:
        return "zero-shot-audio-classification"

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_model(
            context, ZeroShotAudioClassificationPipeline, self.model.repo_id
        )

    def get_params(self):
        return {}

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        samples, _, _ = await context.audio_to_numpy(self.inputs)
        result = self._pipeline(
            samples, candidate_labels=self.candidate_labels.split(",")
        )
        return {item["label"]: item["score"] for item in result}


# class LoadSpeakerEmbedding(BaseNode):
#     """
#     Loads a speaker embedding from a dataset.
#     """

#     dataset_name: str = Field(
#         default="Matthijs/cmu-arctic-xvectors",
#         description="The name of the dataset containing speaker embeddings",
#     )
#     embedding_index: int = Field(
#         default=0, description="The index of the embedding to use"
#     )

#     async def process(self, context: ProcessingContext) -> Tensor:
#         from datasets import load_dataset

#         embeddings_dataset = load_dataset(self.dataset_name, split="validation")
#         speaker_embeddings = torch.tensor(
#             embeddings_dataset[self.embedding_index]["xvector"]  # type: ignore
#         ).unsqueeze(0)
#         return Tensor(value=speaker_embeddings.tolist(), dtype="float32")


# class SpeechT5(BaseNode):
#     """
#     A complete pipeline for text-to-speech using SpeechT5.
#     """

#     text: str = Field(default=str, description="The input text to convert to speech")
#     # speaker_embedding: Tensor = Field(
#     #     default=Tensor(), description="The index of the embedding to use"
#     # )

#     _processor: SpeechT5Processor | None = None
#     _model: SpeechT5ForTextToSpeech | None = None
#     # _vododer: SpeechT5HifiGan | None = None

#     async def initialize(self, context: ProcessingContext):
#         model_name = "microsoft/speecht5_tts"
#         self._processor = SpeechT5Processor.from_pretrained(model_name)  # type: ignore
#         self._model = SpeechT5ForTextToSpeech.from_pretrained(model_name)  # type: ignore
#         # self._vocoder = SpeechT5HifiGan.from_pretrained("microsoft/speecht5_hifigan")

#     async def process(self, context: ProcessingContext) -> AudioRef:
#         # inputs = self._processor(text=self.text, return_tensors="pt")
#         assert self._processor is not None
#         assert self._model is not None

#         # speaker_embedding = self.speaker_embedding.value
#         inputs = self._processor(self.text)

#         assert inputs is not None

#         speech = self._model.generate_speech(
#             inputs["input_ids"],
#             speaker_embedding=speaker_embedding,  # type: ignore
#         )

#         return await context.audio_from_numpy(speech.numpy(), sample_rate=16000)
