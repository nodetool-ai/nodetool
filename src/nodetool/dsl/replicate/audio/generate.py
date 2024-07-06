from pydantic import BaseModel, Field
import nodetool.metadata.types
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode


class Bark(GraphNode):
    prompt: str | GraphNode | tuple[GraphNode, str] = Field(default='Hello, my name is Suno. And, uh — and I like pizza. [laughs] But I also have other interests such as playing tic tac toe.', description='Input prompt')
    text_temp: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='generation temperature (1.0 more diverse, 0.0 more conservative)')
    output_full: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='return full generation as a .npz file to be used as a history prompt')
    waveform_temp: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='generation temperature (1.0 more diverse, 0.0 more conservative)')
    history_prompt: nodetool.nodes.replicate.audio.generate.Bark.History_prompt | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='history choice for audio cloning, choose from the list')
    custom_history_prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Provide your own .npz file with history choice for audio cloning, this will override the previous history_prompt setting')
    @classmethod
    def get_node_type(cls): return "replicate.audio.generate.Bark"


from nodetool.nodes.replicate.audio.generate import Model_version
from nodetool.nodes.replicate.audio.generate import Output_format
from nodetool.nodes.replicate.audio.generate import Normalization_strategy

class MusicGen(GraphNode):
    seed: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Seed for random number generator. If None or -1, a random seed will be used.')
    top_k: int | GraphNode | tuple[GraphNode, str] = Field(default=250, description='Reduces sampling to the k most likely tokens.')
    top_p: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Reduces sampling to tokens with cumulative probability of p. When set to  `0` (default), top_k sampling is used.')
    prompt: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='A description of the music you want to generate.')
    duration: int | GraphNode | tuple[GraphNode, str] = Field(default=8, description='Duration of the generated audio in seconds.')
    input_audio: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="An audio file that will influence the generated music. If `continuation` is `True`, the generated music will be a continuation of the audio file. Otherwise, the generated music will mimic the audio file's melody.")
    temperature: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description="Controls the 'conservativeness' of the sampling process. Higher temperature means more diversity.")
    continuation: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description="If `True`, generated music will continue from `input_audio`. Otherwise, generated music will mimic `input_audio`'s melody.")
    model_version: Model_version | GraphNode | tuple[GraphNode, str] = Field(default=Model_version('stereo-melody-large'), description='Model to use for generation')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('wav'), description='Output format for generated audio.')
    continuation_end: int | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='End time of the audio file to use for continuation. If -1 or None, will default to the end of the audio clip.')
    continuation_start: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Start time of the audio file to use for continuation.')
    multi_band_diffusion: bool | GraphNode | tuple[GraphNode, str] = Field(default=False, description='If `True`, the EnCodec tokens will be decoded with MultiBand Diffusion. Only works with non-stereo models.')
    normalization_strategy: Normalization_strategy | GraphNode | tuple[GraphNode, str] = Field(default=Normalization_strategy('loudness'), description='Strategy for normalizing audio.')
    classifier_free_guidance: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs.')
    @classmethod
    def get_node_type(cls): return "replicate.audio.generate.MusicGen"


from nodetool.nodes.replicate.audio.generate import Rvc_model
from nodetool.nodes.replicate.audio.generate import Pitch_change
from nodetool.nodes.replicate.audio.generate import Output_format
from nodetool.nodes.replicate.audio.generate import Pitch_detection_algorithm

class RealisticVoiceCloning(GraphNode):
    protect: float | GraphNode | tuple[GraphNode, str] = Field(default=0.33, description="Control how much of the original vocals' breath and voiceless consonants to leave in the AI vocals. Set 0.5 to disable.")
    rvc_model: Rvc_model | GraphNode | tuple[GraphNode, str] = Field(default=Rvc_model('Squidward'), description="RVC model for a specific voice. If using a custom model, this should match the name of the downloaded model. If a 'custom_rvc_model_download_url' is provided, this will be automatically set to the name of the downloaded model.")
    index_rate: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description="Control how much of the AI's accent to leave in the vocals.")
    song_input: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='Upload your audio file here.')
    reverb_size: float | GraphNode | tuple[GraphNode, str] = Field(default=0.15, description='The larger the room, the longer the reverb time.')
    pitch_change: Pitch_change | GraphNode | tuple[GraphNode, str] = Field(default=Pitch_change('no-change'), description='Adjust pitch of AI vocals. Options: `no-change`, `male-to-female`, `female-to-male`.')
    rms_mix_rate: float | GraphNode | tuple[GraphNode, str] = Field(default=0.25, description="Control how much to use the original vocal's loudness (0) or a fixed loudness (1).")
    filter_radius: int | GraphNode | tuple[GraphNode, str] = Field(default=3, description='If >=3: apply median filtering median filtering to the harvested pitch results.')
    output_format: Output_format | GraphNode | tuple[GraphNode, str] = Field(default=Output_format('mp3'), description='wav for best quality and large file size, mp3 for decent quality and small file size.')
    reverb_damping: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='Absorption of high frequencies in the reverb.')
    reverb_dryness: float | GraphNode | tuple[GraphNode, str] = Field(default=0.8, description='Level of AI vocals without reverb.')
    reverb_wetness: float | GraphNode | tuple[GraphNode, str] = Field(default=0.2, description='Level of AI vocals with reverb.')
    crepe_hop_length: int | GraphNode | tuple[GraphNode, str] = Field(default=128, description='When `pitch_detection_algo` is set to `mangio-crepe`, this controls how often it checks for pitch changes in milliseconds. Lower values lead to longer conversions and higher risk of voice cracks, but better pitch accuracy.')
    pitch_change_all: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Change pitch/key of background music, backup vocals and AI vocals in semitones. Reduces sound quality slightly.')
    main_vocals_volume_change: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Control volume of main AI vocals. Use -3 to decrease the volume by 3 decibels, or 3 to increase the volume by 3 decibels.')
    pitch_detection_algorithm: Pitch_detection_algorithm | GraphNode | tuple[GraphNode, str] = Field(default=Pitch_detection_algorithm('rmvpe'), description='Best option is rmvpe (clarity in vocals), then mangio-crepe (smoother vocals).')
    instrumental_volume_change: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Control volume of the background music/instrumentals.')
    backup_vocals_volume_change: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Control volume of backup AI vocals.')
    custom_rvc_model_download_url: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description="URL to download a custom RVC model. If provided, the model will be downloaded (if it doesn't already exist) and used for prediction, regardless of the 'rvc_model' value.")
    @classmethod
    def get_node_type(cls): return "replicate.audio.generate.RealisticVoiceCloning"


from nodetool.nodes.replicate.audio.generate import Seed_image_id

class Riffusion(GraphNode):
    alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=0.5, description='Interpolation alpha if using two prompts. A value of 0 uses prompt_a fully, a value of 1 uses prompt_b fully')
    prompt_a: str | GraphNode | tuple[GraphNode, str] = Field(default='funky synth solo', description='The prompt for your audio')
    prompt_b: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='The second prompt to interpolate with the first, leave blank if no interpolation')
    denoising: float | GraphNode | tuple[GraphNode, str] = Field(default=0.75, description='How much to transform input spectrogram')
    seed_image_id: Seed_image_id | GraphNode | tuple[GraphNode, str] = Field(default=Seed_image_id('vibes'), description='Seed spectrogram to use')
    num_inference_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=50, description='Number of steps to run the diffusion model')
    @classmethod
    def get_node_type(cls): return "replicate.audio.generate.Riffusion"



class StyleTTS2(GraphNode):
    beta: float | GraphNode | tuple[GraphNode, str] = Field(default=0.7, description='Only used for long text inputs or in case of reference speaker,             determines the prosody of the speaker. Use lower values to sample style based             on previous or reference speech instead of text.')
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Seed for reproducibility')
    text: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Text to convert to speech')
    alpha: float | GraphNode | tuple[GraphNode, str] = Field(default=0.3, description='Only used for long text inputs or in case of reference speaker,             determines the timbre of the speaker. Use lower values to sample style based             on previous or reference speech instead of text.')
    weights: str | None | GraphNode | tuple[GraphNode, str] = Field(default=None, description='Replicate weights url for inference with model that is fine-tuned on new speakers.            If provided, a reference speech must also be provided.             If not provided, the default model will be used.')
    reference: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='Reference speech to copy style from')
    diffusion_steps: int | GraphNode | tuple[GraphNode, str] = Field(default=10, description='Number of diffusion steps')
    embedding_scale: float | GraphNode | tuple[GraphNode, str] = Field(default=1, description='Embedding scale, use higher values for pronounced emotion')
    @classmethod
    def get_node_type(cls): return "replicate.audio.generate.StyleTTS2"


from nodetool.nodes.replicate.audio.generate import Preset
from nodetool.nodes.replicate.audio.generate import Voice_a
from nodetool.nodes.replicate.audio.generate import Voice_b
from nodetool.nodes.replicate.audio.generate import Voice_c

class TortoiseTTS(GraphNode):
    seed: int | GraphNode | tuple[GraphNode, str] = Field(default=0, description='Random seed which can be used to reproduce results.')
    text: str | GraphNode | tuple[GraphNode, str] = Field(default='The expressiveness of autoregressive transformers is literally nuts! I absolutely adore them.', description='Text to speak.')
    preset: Preset | GraphNode | tuple[GraphNode, str] = Field(default=Preset('fast'), description='Which voice preset to use. See the documentation for more information.')
    voice_a: Voice_a | GraphNode | tuple[GraphNode, str] = Field(default=Voice_a('random'), description='Selects the voice to use for generation. Use `random` to select a random voice. Use `custom_voice` to use a custom voice.')
    voice_b: Voice_b | GraphNode | tuple[GraphNode, str] = Field(default=Voice_b('disabled'), description='(Optional) Create new voice from averaging the latents for `voice_a`, `voice_b` and `voice_c`. Use `disabled` to disable voice mixing.')
    voice_c: Voice_c | GraphNode | tuple[GraphNode, str] = Field(default=Voice_c('disabled'), description='(Optional) Create new voice from averaging the latents for `voice_a`, `voice_b` and `voice_c`. Use `disabled` to disable voice mixing.')
    cvvp_amount: float | GraphNode | tuple[GraphNode, str] = Field(default=0, description='How much the CVVP model should influence the output. Increasing this can in some cases reduce the likelyhood of multiple speakers. Defaults to 0 (disabled)')
    custom_voice: AudioRef | GraphNode | tuple[GraphNode, str] = Field(default=AudioRef(type='audio', uri='', asset_id=None, temp_id=None), description='(Optional) Create a custom voice based on an mp3 file of a speaker. Audio should be at least 15 seconds, only contain one speaker, and be in mp3 format. Overrides the `voice_a` input.')
    @classmethod
    def get_node_type(cls): return "replicate.audio.generate.TortoiseTTS"


