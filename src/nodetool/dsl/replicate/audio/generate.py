from pydantic import BaseModel, Field
import typing
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class MMAudio(GraphNode):
    """
    Add sound to video. An advanced AI model that synthesizes high-quality audio from video content, enabling seamless video-to-audio transformation.
    audio, video, synthesis, transformation, sound, video-to-audio, vid2wav

    Use cases:
    - Generate audio for silent videos
    - Create sound effects from visuals
    - Produce synchronized audio content
    - Generate ambient soundscapes
    - Create video soundtracks
    """

    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=-1, description='Random seed. Use -1 to randomize the seed')
    video: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Optional video file for video-to-audio generation')
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='', description='Text prompt for generated audio')
    duration: float | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Duration of output in seconds')
    num_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=25, description='Number of inference steps')
    cfg_strength: float | GraphNode | tuple[GraphNode, str] = Field(default=4.5, description='Guidance strength (CFG)')
    negative_prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='music', description='Negative prompt to avoid certain sounds')

    @classmethod
    def get_node_type(cls): return "replicate.audio.generate.MMAudio"


import nodetool.nodes.replicate.audio.generate
import nodetool.nodes.replicate.audio.generate
import nodetool.nodes.replicate.audio.generate

class MusicGen(GraphNode):
    """
    Generate music from a prompt or melody.
    music, generation, audio, melody, synthesis

    Use cases:
    - Create original music compositions
    - Generate music from text descriptions
    - Produce melody variations
    - Create custom soundtracks
    - Generate background music
    """

    Model_version: typing.ClassVar[type] = nodetool.nodes.replicate.audio.generate.MusicGen.Model_version
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.audio.generate.MusicGen.Output_format
    Normalization_strategy: typing.ClassVar[type] = nodetool.nodes.replicate.audio.generate.MusicGen.Normalization_strategy
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Seed for random number generator. If None or -1, a random seed will be used.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=250, description='Reduces sampling to the k most likely tokens.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Reduces sampling to tokens with cumulative probability of p. When set to  `0` (default), top_k sampling is used.')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='A description of the music you want to generate.')
    duration: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Duration of the generated audio in seconds.')
    input_audio: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="An audio file that will influence the generated music. If `continuation` is `True`, the generated music will be a continuation of the audio file. Otherwise, the generated music will mimic the audio file's melody.")
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Controls the 'conservativeness' of the sampling process. Higher temperature means more diversity.")
    continuation: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description="If `True`, generated music will continue from `input_audio`. Otherwise, generated music will mimic `input_audio`'s melody.")
    model_version: nodetool.nodes.replicate.audio.generate.MusicGen.Model_version = Field(default=Model_version.STEREO_MELODY_LARGE, description='Model to use for generation')
    output_format: nodetool.nodes.replicate.audio.generate.MusicGen.Output_format = Field(default=Output_format.WAV, description='Output format for generated audio.')
    continuation_end: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='End time of the audio file to use for continuation. If -1 or None, will default to the end of the audio clip.')
    continuation_start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Start time of the audio file to use for continuation.')
    multi_band_diffusion: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='If `True`, the EnCodec tokens will be decoded with MultiBand Diffusion. Only works with non-stereo models.')
    normalization_strategy: nodetool.nodes.replicate.audio.generate.MusicGen.Normalization_strategy = Field(default=Normalization_strategy.LOUDNESS, description='Strategy for normalizing audio.')
    classifier_free_guidance: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs.')

    @classmethod
    def get_node_type(cls): return "replicate.audio.generate.MusicGen"


import nodetool.nodes.replicate.audio.generate
import nodetool.nodes.replicate.audio.generate
import nodetool.nodes.replicate.audio.generate
import nodetool.nodes.replicate.audio.generate

class RealisticVoiceCloning(GraphNode):
    """Create song covers with any RVC v2 trained AI voice from audio files."""

    Rvc_model: typing.ClassVar[type] = nodetool.nodes.replicate.audio.generate.RealisticVoiceCloning.Rvc_model
    Pitch_change: typing.ClassVar[type] = nodetool.nodes.replicate.audio.generate.RealisticVoiceCloning.Pitch_change
    Output_format: typing.ClassVar[type] = nodetool.nodes.replicate.audio.generate.RealisticVoiceCloning.Output_format
    Pitch_detection_algorithm: typing.ClassVar[type] = nodetool.nodes.replicate.audio.generate.RealisticVoiceCloning.Pitch_detection_algorithm
    protect: float | GraphNode | tuple[GraphNode, str] = Field(default=0.33, description="Control how much of the original vocals' breath and voiceless consonants to leave in the AI vocals. Set 0.5 to disable.")
    rvc_model: nodetool.nodes.replicate.audio.generate.RealisticVoiceCloning.Rvc_model = Field(default=Rvc_model.SQUIDWARD, description="RVC model for a specific voice. If using a custom model, this should match the name of the downloaded model. If a 'custom_rvc_model_download_url' is provided, this will be automatically set to the name of the downloaded model.")
    index_rate: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description="Control how much of the AI's accent to leave in the vocals.")
    song_input: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Upload your audio file here.')
    reverb_size: float | GraphNode | tuple[GraphNode, str] = Field(default=0.15, description='The larger the room, the longer the reverb time.')
    pitch_change: nodetool.nodes.replicate.audio.generate.RealisticVoiceCloning.Pitch_change = Field(default=Pitch_change.NO_CHANGE, description='Adjust pitch of AI vocals. Options: `no-change`, `male-to-female`, `female-to-male`.')
    rms_mix_rate: float | GraphNode | tuple[GraphNode, str] = Field(default=0.25, description="Control how much to use the original vocal's loudness (0) or a fixed loudness (1).")
    filter_radius: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='If >=3: apply median filtering median filtering to the harvested pitch results.')
    output_format: nodetool.nodes.replicate.audio.generate.RealisticVoiceCloning.Output_format = Field(default=Output_format.MP3, description='wav for best quality and large file size, mp3 for decent quality and small file size.')
    reverb_damping: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='Absorption of high frequencies in the reverb.')
    reverb_dryness: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Level of AI vocals without reverb.')
    reverb_wetness: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='Level of AI vocals with reverb.')
    crepe_hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=128, description='When `pitch_detection_algo` is set to `mangio-crepe`, this controls how often it checks for pitch changes in milliseconds. Lower values lead to longer conversions and higher risk of voice cracks, but better pitch accuracy.')
    pitch_change_all: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Change pitch/key of background music, backup vocals and AI vocals in semitones. Reduces sound quality slightly.')
    main_vocals_volume_change: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Control volume of main AI vocals. Use -3 to decrease the volume by 3 decibels, or 3 to increase the volume by 3 decibels.')
    pitch_detection_algorithm: nodetool.nodes.replicate.audio.generate.RealisticVoiceCloning.Pitch_detection_algorithm = Field(default=Pitch_detection_algorithm.RMVPE, description='Best option is rmvpe (clarity in vocals), then mangio-crepe (smoother vocals).')
    instrumental_volume_change: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Control volume of the background music/instrumentals.')
    backup_vocals_volume_change: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Control volume of backup AI vocals.')
    custom_rvc_model_download_url: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="URL to download a custom RVC model. If provided, the model will be downloaded (if it doesn't already exist) and used for prediction, regardless of the 'rvc_model' value.")

    @classmethod
    def get_node_type(cls): return "replicate.audio.generate.RealisticVoiceCloning"


import nodetool.nodes.replicate.audio.generate

class Riffusion(GraphNode):
    """
    Stable diffusion for real-time music generation.
    audio, music, generation, real-time, diffusion

    Use cases:
    - Generate music from text descriptions
    - Create custom soundtracks
    - Produce background music
    - Generate sound effects
    - Create musical variations
    """

    Seed_image_id: typing.ClassVar[type] = nodetool.nodes.replicate.audio.generate.Riffusion.Seed_image_id
    alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Interpolation alpha if using two prompts. A value of 0 uses prompt_a fully, a value of 1 uses prompt_b fully')
    prompt_a: str | GraphNode | tuple[GraphNode, str] = Field(default='funky synth solo', description='The prompt for your audio')
    prompt_b: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The second prompt to interpolate with the first, leave blank if no interpolation')
    denoising: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='How much to transform input spectrogram')
    seed_image_id: nodetool.nodes.replicate.audio.generate.Riffusion.Seed_image_id = Field(default=Seed_image_id.VIBES, description='Seed spectrogram to use')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of steps to run the diffusion model')

    @classmethod
    def get_node_type(cls): return "replicate.audio.generate.Riffusion"



class StyleTTS2(GraphNode):
    """
    Generates speech from text.
    speech, synthesis, text-to-speech, voice, generation

    Use cases:
    - Convert text to natural speech
    - Generate styled voice content
    - Create audio narrations
    - Produce voice-based media
    - Generate multilingual speech
    """

    beta: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='Only used for long text inputs or in case of reference speaker, determines the prosody of the speaker. Use lower values to sample style based on previous or reference speech instead of text.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Seed for reproducibility')
    text: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text to convert to speech')
    alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=0.3, description='Only used for long text inputs or in case of reference speaker, determines the timbre of the speaker. Use lower values to sample style based on previous or reference speech instead of text.')
    weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate weights url for inference with model that is fine-tuned on new speakers. If provided, a reference speech must also be provided. If not provided, the default model will be used.')
    reference: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='Reference speech to copy style from')
    diffusion_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Number of diffusion steps')
    embedding_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Embedding scale, use higher values for pronounced emotion')

    @classmethod
    def get_node_type(cls): return "replicate.audio.generate.StyleTTS2"


import nodetool.nodes.replicate.audio.generate
import nodetool.nodes.replicate.audio.generate
import nodetool.nodes.replicate.audio.generate
import nodetool.nodes.replicate.audio.generate

class TortoiseTTS(GraphNode):
    """
    Generate speech from text, clone voices from mp3 files. From James Betker AKA "neonbjb".
    speech, voice, synthesis, cloning, text-to-speech, text-to-audio

    Use cases:
    - Generate natural-sounding speech
    - Clone and replicate voices
    - Create custom voiceovers
    - Produce multilingual speech
    - Create voice-based content
    """

    Preset: typing.ClassVar[type] = nodetool.nodes.replicate.audio.generate.TortoiseTTS.Preset
    Voice_a: typing.ClassVar[type] = nodetool.nodes.replicate.audio.generate.TortoiseTTS.Voice_a
    Voice_b: typing.ClassVar[type] = nodetool.nodes.replicate.audio.generate.TortoiseTTS.Voice_b
    Voice_c: typing.ClassVar[type] = nodetool.nodes.replicate.audio.generate.TortoiseTTS.Voice_c
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Random seed which can be used to reproduce results.')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='The expressiveness of autoregressive transformers is literally nuts! I absolutely adore them.', description='Text to speak.')
    preset: nodetool.nodes.replicate.audio.generate.TortoiseTTS.Preset = Field(default=Preset.FAST, description='Which voice preset to use. See the documentation for more information.')
    voice_a: nodetool.nodes.replicate.audio.generate.TortoiseTTS.Voice_a = Field(default=Voice_a.RANDOM, description='Selects the voice to use for generation. Use `random` to select a random voice. Use `custom_voice` to use a custom voice.')
    voice_b: nodetool.nodes.replicate.audio.generate.TortoiseTTS.Voice_b = Field(default=Voice_b.DISABLED, description='(Optional) Create new voice from averaging the latents for `voice_a`, `voice_b` and `voice_c`. Use `disabled` to disable voice mixing.')
    voice_c: nodetool.nodes.replicate.audio.generate.TortoiseTTS.Voice_c = Field(default=Voice_c.DISABLED, description='(Optional) Create new voice from averaging the latents for `voice_a`, `voice_b` and `voice_c`. Use `disabled` to disable voice mixing.')
    cvvp_amount: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='How much the CVVP model should influence the output. Increasing this can in some cases reduce the likelyhood of multiple speakers. Defaults to 0 (disabled)')
    custom_voice: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, data=None), description='(Optional) Create a custom voice based on an mp3 file of a speaker. Audio should be at least 15 seconds, only contain one speaker, and be in mp3 format. Overrides the `voice_a` input.')

    @classmethod
    def get_node_type(cls): return "replicate.audio.generate.TortoiseTTS"


