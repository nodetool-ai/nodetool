import torch
from nodetool.metadata.types import AudioRef, HFTextToSpeech, HuggingFaceModel
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field
from transformers import TextToAudioPipeline, Pipeline


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
            context=context,
            pipeline_task="text-to-speech",
            model_id=self.get_model_id(),
            device=context.device,
        )  # type: ignore

    async def process(self, context: ProcessingContext) -> AudioRef:
        assert self._pipeline is not None, "Pipeline not initialized"
        result = self._pipeline(self.prompt, forward_params={"do_sample": True})
        audio = await context.audio_from_numpy(result["audio"], 24_000)  # type: ignore
        return audio


# class ParlerTTS(HuggingFacePipelineNode):
#     """
#     Generates speech from text using the Parler TTS model.
#     tts, audio, speech, huggingface

#     Use cases:
#     - Create voice content for apps and websites
#     - Generate natural-sounding speech for various applications
#     - Produce audio narrations for videos or presentations
#     """

#     model: HFTextToSpeech = Field(
#         default=HFTextToSpeech(),
#         title="Model ID on Huggingface",
#         description="The model ID to use for text-to-speech generation",
#     )
#     prompt: str = Field(
#         default="Hey, how are you doing today?",
#         title="Prompt",
#         description="The text to convert to speech",
#     )
#     description: str = Field(
#         default="A female speaker delivers a slightly expressive and animated speech with a moderate speed and pitch. The recording is of very high quality, with the speaker's voice sounding clear and very close up.",
#         title="Description",
#         description="A description of the desired speech characteristics",
#     )

#     _model: ParlerTTSForConditionalGeneration | None = None
#     _tokenizer: AutoTokenizer | None = None

#     @classmethod
#     def get_recommended_models(cls) -> list[HuggingFaceModel]:
#         return [
#             HFTextToSpeech(
#                 repo_id="parler-tts/parler-tts-mini-v1",
#             ),
#             HFTextToSpeech(
#                 repo_id="parler-tts/parler-tts-large-v1",
#             ),
#         ]

#     def get_model_id(self):
#         return self.model.repo_id

#     async def initialize(self, context: ProcessingContext):
#         self._model = await self.load_model(
#             context=context,
#             model_class=ParlerTTSForConditionalGeneration,
#             model_id=self.get_model_id(),
#             variant=None,
#             torch_dtype=torch.float32,
#         )
#         self._tokenizer = AutoTokenizer.from_pretrained(self.get_model_id())  # type: ignore

#     async def move_to_device(self, device: str):
#         if self._model is not None:
#             self._model.to(device)  # type: ignore

#     async def process(self, context: ProcessingContext) -> AudioRef:
#         if self._model is None or self._tokenizer is None:
#             raise ValueError("Model or tokenizer not initialized")

#         device = context.device

#         input_ids = self._tokenizer(self.description, return_tensors="pt").input_ids.to(  # type: ignore
#             device
#         )
#         prompt_input_ids = self._tokenizer(
#             self.prompt, return_tensors="pt"
#         ).input_ids.to(  # type: ignore
#             device
#         )

#         generation = self._model.generate(
#             input_ids=input_ids, prompt_input_ids=prompt_input_ids
#         )
#         audio_arr = generation.cpu().numpy().squeeze()  # type: ignore

#         return await context.audio_from_numpy(
#             audio_arr, self._model.config.sampling_rate
#         )


class TextToSpeech(HuggingFacePipelineNode):
    """
    A generic Text-to-Speech node that can work with various Hugging Face TTS models.
    tts, audio, speech, huggingface

    Use cases:
    - Generate speech from text for various applications
    - Create voice content for apps, websites, or virtual assistants
    - Produce audio narrations for videos, presentations, or e-learning content
    """

    model: HFTextToSpeech = Field(
        default=HFTextToSpeech(),
        title="Model ID on Huggingface",
        description="The model ID to use for text-to-speech generation",
    )
    text: str = Field(
        default="Hello, this is a test of the text-to-speech system.",
        title="Input Text",
        description="The text to convert to speech",
    )
    _pipeline: Pipeline | None = None

    @classmethod
    def get_recommended_models(cls) -> list[HuggingFaceModel]:
        return [
            HFTextToSpeech(
                repo_id="facebook/mms-tts-eng",
                allow_patterns=["*.bin", "*.json", "*.txt"],
            ),
            HFTextToSpeech(
                repo_id="facebook/mms-tts-kor",
                allow_patterns=["*.bin", "*.json", "*.txt"],
            ),
            HFTextToSpeech(
                repo_id="facebook/mms-tts-fra",
                allow_patterns=["*.bin", "*.json", "*.txt"],
            ),
        ]

    def get_model_id(self):
        return self.model.repo_id

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context,
            "text-to-speech",
            self.get_model_id(),
            device=context.device,
            torch_dtype=torch.float32,
        )

    async def move_to_device(self, device: str):
        if self._pipeline is not None:
            self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> AudioRef:
        assert self._pipeline is not None, "Pipeline not initialized"

        result = self._pipeline(self.text)

        if isinstance(result, dict) and "audio" in result:
            audio_array = result["audio"]
        elif isinstance(result, tuple) and len(result) == 2:
            audio_array, sample_rate = result
        else:
            raise ValueError("Unexpected output format from the TTS pipeline")

        # Assuming a default sample rate of 16000 if not provided
        sample_rate = getattr(self._pipeline, "sampling_rate", 16000)

        return await context.audio_from_numpy(audio_array, sample_rate)


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
