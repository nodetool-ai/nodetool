from pydantic import Field
from nodetool.metadata.types import AudioRef
from nodetool.nodes.fal.fal_node import FALNode
from nodetool.workflows.processing_context import ProcessingContext


class MMAudioV2(FALNode):
    """
    MMAudio V2 generates synchronized audio given text inputs. It can generate sounds described by a prompt.
    audio, generation, synthesis, text-to-audio, synchronization

    Use cases:
    - Generate synchronized audio from text descriptions
    - Create custom sound effects
    - Produce ambient soundscapes
    - Generate audio for multimedia content
    - Create sound design elements
    """

    prompt: str = Field(default="", description="The prompt to generate the audio for")
    negative_prompt: str = Field(
        default="",
        description="The negative prompt to avoid certain elements in the generated audio",
    )
    num_steps: int = Field(
        default=25, ge=1, description="The number of steps to generate the audio for"
    )
    duration: float = Field(
        default=8.0,
        ge=1.0,
        description="The duration of the audio to generate in seconds",
    )
    cfg_strength: float = Field(
        default=4.5, description="The strength of Classifier Free Guidance"
    )
    mask_away_clip: bool = Field(
        default=False, description="Whether to mask away the clip"
    )
    seed: int = Field(
        default=-1, description="The same seed will output the same audio every time"
    )

    @classmethod
    def get_title(cls):
        return "MMAudio V2"

    async def process(self, context: ProcessingContext) -> AudioRef:
        arguments = {
            "prompt": self.prompt,
            "num_steps": self.num_steps,
            "duration": self.duration,
            "cfg_strength": self.cfg_strength,
            "mask_away_clip": self.mask_away_clip,
        }

        if self.negative_prompt:
            arguments["negative_prompt"] = self.negative_prompt
        if self.seed != -1:
            arguments["seed"] = self.seed

        res = await self.submit_request(
            context=context,
            application="fal-ai/mmaudio-v2/text-to-audio",
            arguments=arguments,
        )
        assert "audio" in res
        return AudioRef(uri=res["audio"]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["prompt", "duration", "num_steps"]


class StableAudio(FALNode):
    """
    Stable Audio generates audio from text prompts. Open source text-to-audio model from fal.ai.
    audio, generation, synthesis, text-to-audio, open-source

    Use cases:
    - Generate custom audio content from text
    - Create background music and sounds
    - Produce audio assets for projects
    - Generate sound effects
    - Create experimental audio content
    """

    prompt: str = Field(default="", description="The prompt to generate the audio from")
    seconds_start: int = Field(
        default=0, description="The start point of the audio clip to generate"
    )
    seconds_total: int = Field(
        default=30, description="The duration of the audio clip to generate in seconds"
    )
    steps: int = Field(
        default=100, description="The number of steps to denoise the audio for"
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        arguments = {
            "prompt": self.prompt,
            "seconds_total": self.seconds_total,
            "steps": self.steps,
        }

        if self.seconds_start > 0:
            arguments["seconds_start"] = self.seconds_start

        res = await self.submit_request(
            context=context,
            application="fal-ai/stable-audio",
            arguments=arguments,
        )
        assert "audio_file" in res
        return AudioRef(uri=res["audio_file"]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["prompt", "seconds_total", "steps"]


class F5TTS(FALNode):
    """
    F5 TTS (Text-to-Speech) model for generating natural-sounding speech from text with voice cloning capabilities.
    audio, tts, voice-cloning, speech, synthesis, text-to-speech, tts, text-to-audio

    Use cases:
    - Generate natural speech from text
    - Clone and replicate voices
    - Create custom voiceovers
    - Produce multilingual speech content
    - Generate personalized audio content
    """

    gen_text: str = Field(default="", description="The text to be converted to speech")
    ref_audio_url: str = Field(
        default="",
        description="URL of the reference audio file to clone the voice from",
    )
    ref_text: str = Field(
        default="",
        description="Optional reference text. If not provided, ASR will be used",
    )
    model_type: str = Field(
        default="F5-TTS",
        description="Model type to use (F5-TTS or E2-TTS)",
    )
    remove_silence: bool = Field(
        default=True,
        description="Whether to remove silence from the generated audio",
    )

    async def process(self, context: ProcessingContext) -> AudioRef:
        arguments = {
            "gen_text": self.gen_text,
            "ref_audio_url": self.ref_audio_url,
            "model_type": self.model_type,
            "remove_silence": self.remove_silence,
        }

        if self.ref_text:
            arguments["ref_text"] = self.ref_text

        res = await self.submit_request(
            context=context,
            application="fal-ai/f5-tts",
            arguments=arguments,
        )
        assert "audio_url" in res
        return AudioRef(uri=res["audio_url"]["url"])

    @classmethod
    def get_basic_fields(cls):
        return ["gen_text", "ref_audio_url", "model_type"]

    @classmethod
    def get_title(cls):
        return "F5 TTS"
