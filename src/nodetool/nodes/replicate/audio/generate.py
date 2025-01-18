from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.providers.replicate.replicate_node import ReplicateNode
from enum import Enum


class RealisticVoiceCloning(ReplicateNode):
    """Create song covers with any RVC v2 trained AI voice from audio files."""

    class Rvc_model(str, Enum):
        SQUIDWARD = "Squidward"
        MRKRABS = "MrKrabs"
        PLANKTON = "Plankton"
        DRAKE = "Drake"
        VADER = "Vader"
        TRUMP = "Trump"
        BIDEN = "Biden"
        OBAMA = "Obama"
        GUITAR = "Guitar"
        VOILIN = "Voilin"
        CUSTOM = "CUSTOM"

    class Pitch_change(str, Enum):
        NO_CHANGE = "no-change"
        MALE_TO_FEMALE = "male-to-female"
        FEMALE_TO_MALE = "female-to-male"

    class Output_format(str, Enum):
        MP3 = "mp3"
        WAV = "wav"

    class Pitch_detection_algorithm(str, Enum):
        RMVPE = "rmvpe"
        MANGIO_CREPE = "mangio-crepe"

    @classmethod
    def get_basic_fields(cls):
        return ["protect", "rvc_model", "index_rate"]

    @classmethod
    def replicate_model_id(cls):
        return "zsxkib/realistic-voice-cloning:0a9c7c558af4c0f20667c1bd1260ce32a2879944a0b9e44e1398660c077b1550"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/ce3d3d2c-5a06-413c-96ff-546fc96c90e2/Out_0_1024x1024.png",
            "created_at": "2023-11-09T16:32:42.062982Z",
            "description": "Create song covers with any RVC v2 trained AI voice from audio files.",
            "github_url": "https://github.com/zsxkib/AICoverGen.git",
            "license_url": "https://github.com/SociallyIneptWeeb/AICoverGen/blob/main/LICENSE",
            "name": "realistic-voice-cloning",
            "owner": "zsxkib",
            "paper_url": None,
            "run_count": 530184,
            "url": "https://replicate.com/zsxkib/realistic-voice-cloning",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return AudioRef

    protect: float = Field(
        title="Protect",
        description="Control how much of the original vocals' breath and voiceless consonants to leave in the AI vocals. Set 0.5 to disable.",
        ge=0.0,
        le=0.5,
        default=0.33,
    )
    rvc_model: Rvc_model = Field(
        description="RVC model for a specific voice. If using a custom model, this should match the name of the downloaded model. If a 'custom_rvc_model_download_url' is provided, this will be automatically set to the name of the downloaded model.",
        default=Rvc_model("Squidward"),
    )
    index_rate: float = Field(
        title="Index Rate",
        description="Control how much of the AI's accent to leave in the vocals.",
        ge=0.0,
        le=1.0,
        default=0.5,
    )
    song_input: AudioRef = Field(
        default=AudioRef(), description="Upload your audio file here."
    )
    reverb_size: float = Field(
        title="Reverb Size",
        description="The larger the room, the longer the reverb time.",
        ge=0.0,
        le=1.0,
        default=0.15,
    )
    pitch_change: Pitch_change = Field(
        description="Adjust pitch of AI vocals. Options: `no-change`, `male-to-female`, `female-to-male`.",
        default=Pitch_change("no-change"),
    )
    rms_mix_rate: float = Field(
        title="Rms Mix Rate",
        description="Control how much to use the original vocal's loudness (0) or a fixed loudness (1).",
        ge=0.0,
        le=1.0,
        default=0.25,
    )
    filter_radius: int = Field(
        title="Filter Radius",
        description="If >=3: apply median filtering median filtering to the harvested pitch results.",
        ge=0.0,
        le=7.0,
        default=3,
    )
    output_format: Output_format = Field(
        description="wav for best quality and large file size, mp3 for decent quality and small file size.",
        default=Output_format("mp3"),
    )
    reverb_damping: float = Field(
        title="Reverb Damping",
        description="Absorption of high frequencies in the reverb.",
        ge=0.0,
        le=1.0,
        default=0.7,
    )
    reverb_dryness: float = Field(
        title="Reverb Dryness",
        description="Level of AI vocals without reverb.",
        ge=0.0,
        le=1.0,
        default=0.8,
    )
    reverb_wetness: float = Field(
        title="Reverb Wetness",
        description="Level of AI vocals with reverb.",
        ge=0.0,
        le=1.0,
        default=0.2,
    )
    crepe_hop_length: int = Field(
        title="Crepe Hop Length",
        description="When `pitch_detection_algo` is set to `mangio-crepe`, this controls how often it checks for pitch changes in milliseconds. Lower values lead to longer conversions and higher risk of voice cracks, but better pitch accuracy.",
        default=128,
    )
    pitch_change_all: float = Field(
        title="Pitch Change All",
        description="Change pitch/key of background music, backup vocals and AI vocals in semitones. Reduces sound quality slightly.",
        default=0,
    )
    main_vocals_volume_change: float = Field(
        title="Main Vocals Volume Change",
        description="Control volume of main AI vocals. Use -3 to decrease the volume by 3 decibels, or 3 to increase the volume by 3 decibels.",
        default=0,
    )
    pitch_detection_algorithm: Pitch_detection_algorithm = Field(
        description="Best option is rmvpe (clarity in vocals), then mangio-crepe (smoother vocals).",
        default=Pitch_detection_algorithm("rmvpe"),
    )
    instrumental_volume_change: float = Field(
        title="Instrumental Volume Change",
        description="Control volume of the background music/instrumentals.",
        default=0,
    )
    backup_vocals_volume_change: float = Field(
        title="Backup Vocals Volume Change",
        description="Control volume of backup AI vocals.",
        default=0,
    )
    custom_rvc_model_download_url: str | None = Field(
        title="Custom Rvc Model Download Url",
        description="URL to download a custom RVC model. If provided, the model will be downloaded (if it doesn't already exist) and used for prediction, regardless of the 'rvc_model' value.",
        default=None,
    )


class TortoiseTTS(ReplicateNode):
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

    class Preset(str, Enum):
        ULTRA_FAST = "ultra_fast"
        FAST = "fast"
        STANDARD = "standard"
        HIGH_QUALITY = "high_quality"

    class Voice_a(str, Enum):
        ANGIE = "angie"
        COND_LATENT_EXAMPLE = "cond_latent_example"
        DENIRO = "deniro"
        FREEMAN = "freeman"
        HALLE = "halle"
        LJ = "lj"
        MYSELF = "myself"
        PAT2 = "pat2"
        SNAKES = "snakes"
        TOM = "tom"
        TRAIN_DAWS = "train_daws"
        TRAIN_DREAMS = "train_dreams"
        TRAIN_GRACE = "train_grace"
        TRAIN_LESCAULT = "train_lescault"
        WEAVER = "weaver"
        APPLEJACK = "applejack"
        DANIEL = "daniel"
        EMMA = "emma"
        GERALT = "geralt"
        JLAW = "jlaw"
        MOL = "mol"
        PAT = "pat"
        RAINBOW = "rainbow"
        TIM_REYNOLDS = "tim_reynolds"
        TRAIN_ATKINS = "train_atkins"
        TRAIN_DOTRICE = "train_dotrice"
        TRAIN_EMPIRE = "train_empire"
        TRAIN_KENNARD = "train_kennard"
        TRAIN_MOUSE = "train_mouse"
        WILLIAM = "william"
        RANDOM = "random"
        CUSTOM_VOICE = "custom_voice"
        DISABLED = "disabled"

    class Voice_b(str, Enum):
        ANGIE = "angie"
        COND_LATENT_EXAMPLE = "cond_latent_example"
        DENIRO = "deniro"
        FREEMAN = "freeman"
        HALLE = "halle"
        LJ = "lj"
        MYSELF = "myself"
        PAT2 = "pat2"
        SNAKES = "snakes"
        TOM = "tom"
        TRAIN_DAWS = "train_daws"
        TRAIN_DREAMS = "train_dreams"
        TRAIN_GRACE = "train_grace"
        TRAIN_LESCAULT = "train_lescault"
        WEAVER = "weaver"
        APPLEJACK = "applejack"
        DANIEL = "daniel"
        EMMA = "emma"
        GERALT = "geralt"
        JLAW = "jlaw"
        MOL = "mol"
        PAT = "pat"
        RAINBOW = "rainbow"
        TIM_REYNOLDS = "tim_reynolds"
        TRAIN_ATKINS = "train_atkins"
        TRAIN_DOTRICE = "train_dotrice"
        TRAIN_EMPIRE = "train_empire"
        TRAIN_KENNARD = "train_kennard"
        TRAIN_MOUSE = "train_mouse"
        WILLIAM = "william"
        RANDOM = "random"
        CUSTOM_VOICE = "custom_voice"
        DISABLED = "disabled"

    class Voice_c(str, Enum):
        ANGIE = "angie"
        COND_LATENT_EXAMPLE = "cond_latent_example"
        DENIRO = "deniro"
        FREEMAN = "freeman"
        HALLE = "halle"
        LJ = "lj"
        MYSELF = "myself"
        PAT2 = "pat2"
        SNAKES = "snakes"
        TOM = "tom"
        TRAIN_DAWS = "train_daws"
        TRAIN_DREAMS = "train_dreams"
        TRAIN_GRACE = "train_grace"
        TRAIN_LESCAULT = "train_lescault"
        WEAVER = "weaver"
        APPLEJACK = "applejack"
        DANIEL = "daniel"
        EMMA = "emma"
        GERALT = "geralt"
        JLAW = "jlaw"
        MOL = "mol"
        PAT = "pat"
        RAINBOW = "rainbow"
        TIM_REYNOLDS = "tim_reynolds"
        TRAIN_ATKINS = "train_atkins"
        TRAIN_DOTRICE = "train_dotrice"
        TRAIN_EMPIRE = "train_empire"
        TRAIN_KENNARD = "train_kennard"
        TRAIN_MOUSE = "train_mouse"
        WILLIAM = "william"
        RANDOM = "random"
        CUSTOM_VOICE = "custom_voice"
        DISABLED = "disabled"

    @classmethod
    def get_basic_fields(cls):
        return ["seed", "text", "preset"]

    @classmethod
    def replicate_model_id(cls):
        return "afiaka87/tortoise-tts:e9658de4b325863c4fcdc12d94bb7c9b54cbfe351b7ca1b36860008172b91c71"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": None,
            "created_at": "2022-08-02T02:01:54.555794Z",
            "description": 'Generate speech from text, clone voices from mp3 files. From James Betker AKA "neonbjb".',
            "github_url": "https://github.com/afiaka87/tortoise-tts",
            "license_url": "https://github.com/afiaka87/tortoise-tts/blob/main/LICENSE",
            "name": "tortoise-tts",
            "owner": "afiaka87",
            "paper_url": "https://github.com/neonbjb/tortoise-tts",
            "run_count": 166639,
            "url": "https://replicate.com/afiaka87/tortoise-tts",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return AudioRef

    seed: int = Field(
        title="Seed",
        description="Random seed which can be used to reproduce results.",
        default=0,
    )
    text: str = Field(
        title="Text",
        description="Text to speak.",
        default="The expressiveness of autoregressive transformers is literally nuts! I absolutely adore them.",
    )
    preset: Preset = Field(
        description="Which voice preset to use. See the documentation for more information.",
        default=Preset("fast"),
    )
    voice_a: Voice_a = Field(
        description="Selects the voice to use for generation. Use `random` to select a random voice. Use `custom_voice` to use a custom voice.",
        default=Voice_a("random"),
    )
    voice_b: Voice_b = Field(
        description="(Optional) Create new voice from averaging the latents for `voice_a`, `voice_b` and `voice_c`. Use `disabled` to disable voice mixing.",
        default=Voice_b("disabled"),
    )
    voice_c: Voice_c = Field(
        description="(Optional) Create new voice from averaging the latents for `voice_a`, `voice_b` and `voice_c`. Use `disabled` to disable voice mixing.",
        default=Voice_c("disabled"),
    )
    cvvp_amount: float = Field(
        title="Cvvp Amount",
        description="How much the CVVP model should influence the output. Increasing this can in some cases reduce the likelyhood of multiple speakers. Defaults to 0 (disabled)",
        ge=0.0,
        le=1.0,
        default=0,
    )
    custom_voice: AudioRef = Field(
        default=AudioRef(),
        description="(Optional) Create a custom voice based on an mp3 file of a speaker. Audio should be at least 15 seconds, only contain one speaker, and be in mp3 format. Overrides the `voice_a` input.",
    )


class StyleTTS2(ReplicateNode):
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

    @classmethod
    def get_basic_fields(cls):
        return ["beta", "seed", "text"]

    @classmethod
    def replicate_model_id(cls):
        return "adirik/styletts2:989cb5ea6d2401314eb30685740cb9f6fd1c9001b8940659b406f952837ab5ac"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/b3443880-411e-4b5f-b9f9-3db28c59b578/out-0.png",
            "created_at": "2023-11-20T19:22:15.416691Z",
            "description": "Generates speech from text",
            "github_url": "https://github.com/yl4579/StyleTTS2",
            "license_url": "https://github.com/yl4579/StyleTTS2/blob/main/LICENSE",
            "name": "styletts2",
            "owner": "adirik",
            "paper_url": "https://arxiv.org/abs/2306.07691",
            "run_count": 127679,
            "url": "https://replicate.com/adirik/styletts2",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return AudioRef

    beta: float = Field(
        title="Beta",
        description="Only used for long text inputs or in case of reference speaker, determines the prosody of the speaker. Use lower values to sample style based on previous or reference speech instead of text.",
        ge=0.0,
        le=1.0,
        default=0.7,
    )
    seed: int = Field(title="Seed", description="Seed for reproducibility", default=0)
    text: str | None = Field(
        title="Text", description="Text to convert to speech", default=None
    )
    alpha: float = Field(
        title="Alpha",
        description="Only used for long text inputs or in case of reference speaker, determines the timbre of the speaker. Use lower values to sample style based on previous or reference speech instead of text.",
        ge=0.0,
        le=1.0,
        default=0.3,
    )
    weights: str | None = Field(
        title="Weights",
        description="Replicate weights url for inference with model that is fine-tuned on new speakers. If provided, a reference speech must also be provided. If not provided, the default model will be used.",
        default=None,
    )
    reference: AudioRef = Field(
        default=AudioRef(), description="Reference speech to copy style from"
    )
    diffusion_steps: int = Field(
        title="Diffusion Steps",
        description="Number of diffusion steps",
        ge=0.0,
        le=50.0,
        default=10,
    )
    embedding_scale: float = Field(
        title="Embedding Scale",
        description="Embedding scale, use higher values for pronounced emotion",
        ge=0.0,
        le=5.0,
        default=1,
    )


class Riffusion(ReplicateNode):
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

    class Seed_image_id(str, Enum):
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

    @classmethod
    def get_basic_fields(cls):
        return ["alpha", "prompt_a", "prompt_b"]

    @classmethod
    def replicate_model_id(cls):
        return "riffusion/riffusion:8cf61ea6c56afd61d8f5b9ffd14d7c216c0a93844ce2d82ac1c9ecc9c7f24e05"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/4154e53a-5c5d-4ac5-9da8-62a1fec212bf/riffusion.gif",
            "created_at": "2022-12-16T07:31:34.983811Z",
            "description": "Stable diffusion for real-time music generation",
            "github_url": "https://github.com/riffusion/riffusion",
            "license_url": "https://github.com/riffusion/riffusion/blob/main/LICENSE",
            "name": "riffusion",
            "owner": "riffusion",
            "paper_url": "https://www.riffusion.com/about",
            "run_count": 984529,
            "url": "https://replicate.com/riffusion/riffusion",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return AudioRef

    def output_key(self):
        return "audio"

    alpha: float = Field(
        title="Alpha",
        description="Interpolation alpha if using two prompts. A value of 0 uses prompt_a fully, a value of 1 uses prompt_b fully",
        ge=0.0,
        le=1.0,
        default=0.5,
    )
    prompt_a: str = Field(
        title="Prompt A",
        description="The prompt for your audio",
        default="funky synth solo",
    )
    prompt_b: str | None = Field(
        title="Prompt B",
        description="The second prompt to interpolate with the first, leave blank if no interpolation",
        default=None,
    )
    denoising: float = Field(
        title="Denoising",
        description="How much to transform input spectrogram",
        ge=0.0,
        le=1.0,
        default=0.75,
    )
    seed_image_id: Seed_image_id = Field(
        description="Seed spectrogram to use", default=Seed_image_id("vibes")
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of steps to run the diffusion model",
        ge=1.0,
        default=50,
    )


class MusicGen(ReplicateNode):
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

    class Model_version(str, Enum):
        STEREO_MELODY_LARGE = "stereo-melody-large"
        STEREO_LARGE = "stereo-large"
        MELODY_LARGE = "melody-large"
        LARGE = "large"

    class Output_format(str, Enum):
        WAV = "wav"
        MP3 = "mp3"

    class Normalization_strategy(str, Enum):
        LOUDNESS = "loudness"
        CLIP = "clip"
        PEAK = "peak"
        RMS = "rms"

    @classmethod
    def get_basic_fields(cls):
        return ["seed", "top_k", "top_p"]

    @classmethod
    def replicate_model_id(cls):
        return "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/a921a8b3-3e9e-48ef-995c-29143ea11bec/musicgen.jpeg",
            "created_at": "2023-06-12T19:22:05.525230Z",
            "description": "Generate music from a prompt or melody",
            "github_url": "https://github.com/replicate/cog-musicgen",
            "license_url": "https://github.com/facebookresearch/audiocraft/blob/main/LICENSE_weights",
            "name": "musicgen",
            "owner": "meta",
            "paper_url": "https://arxiv.org/abs/2306.05284",
            "run_count": 2217440,
            "url": "https://replicate.com/meta/musicgen",
            "visibility": "public",
            "weights_url": None,
        }

    @classmethod
    def return_type(cls):
        return AudioRef

    seed: int | None = Field(
        title="Seed",
        description="Seed for random number generator. If None or -1, a random seed will be used.",
        default=None,
    )
    top_k: int = Field(
        title="Top K",
        description="Reduces sampling to the k most likely tokens.",
        default=250,
    )
    top_p: float = Field(
        title="Top P",
        description="Reduces sampling to tokens with cumulative probability of p. When set to  `0` (default), top_k sampling is used.",
        default=0,
    )
    prompt: str | None = Field(
        title="Prompt",
        description="A description of the music you want to generate.",
        default=None,
    )
    duration: int = Field(
        title="Duration",
        description="Duration of the generated audio in seconds.",
        default=8,
    )
    input_audio: str | None = Field(
        title="Input Audio",
        description="An audio file that will influence the generated music. If `continuation` is `True`, the generated music will be a continuation of the audio file. Otherwise, the generated music will mimic the audio file's melody.",
        default=None,
    )
    temperature: float = Field(
        title="Temperature",
        description="Controls the 'conservativeness' of the sampling process. Higher temperature means more diversity.",
        default=1,
    )
    continuation: bool = Field(
        title="Continuation",
        description="If `True`, generated music will continue from `input_audio`. Otherwise, generated music will mimic `input_audio`'s melody.",
        default=False,
    )
    model_version: Model_version = Field(
        description="Model to use for generation",
        default=Model_version("stereo-melody-large"),
    )
    output_format: Output_format = Field(
        description="Output format for generated audio.", default=Output_format("wav")
    )
    continuation_end: int | None = Field(
        title="Continuation End",
        description="End time of the audio file to use for continuation. If -1 or None, will default to the end of the audio clip.",
        ge=0.0,
        default=None,
    )
    continuation_start: int = Field(
        title="Continuation Start",
        description="Start time of the audio file to use for continuation.",
        ge=0.0,
        default=0,
    )
    multi_band_diffusion: bool = Field(
        title="Multi Band Diffusion",
        description="If `True`, the EnCodec tokens will be decoded with MultiBand Diffusion. Only works with non-stereo models.",
        default=False,
    )
    normalization_strategy: Normalization_strategy = Field(
        description="Strategy for normalizing audio.",
        default=Normalization_strategy("loudness"),
    )
    classifier_free_guidance: int = Field(
        title="Classifier Free Guidance",
        description="Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs.",
        default=3,
    )


class MMAudio(ReplicateNode):
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

    @classmethod
    def get_basic_fields(cls):
        return ["seed", "video", "prompt"]

    @classmethod
    def replicate_model_id(cls):
        return "zsxkib/mmaudio:4b9f801a167b1f6cc2db6ba7ffdeb307630bf411841d4e8300e63ca992de0be9"

    @classmethod
    def get_hardware(cls):
        return "None"

    @classmethod
    def get_model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_featured_image/34262841-19bf-443c-9892-72488fec1ef2/mmaudio-cover.webp",
            "created_at": "2024-12-11T14:46:16.273908Z",
            "description": "Add sound to video. An advanced AI model that synthesizes high-quality audio from video content, enabling seamless video-to-audio transformation",
            "github_url": "https://github.com/hkchengrex/MMAudio",
            "license_url": "https://github.com/hkchengrex/MMAudio#MIT-1-ov-file",
            "name": "mmaudio",
            "owner": "zsxkib",
            "paper_url": "https://hkchengrex.github.io/MMAudio",
            "run_count": 39507,
            "url": "https://replicate.com/zsxkib/mmaudio",
            "visibility": "public",
            "weights_url": "https://huggingface.co/hkchengrex/MMAudio/tree/main",
        }

    @classmethod
    def return_type(cls):
        return AudioRef

    seed: int = Field(
        title="Seed",
        description="Random seed. Use -1 to randomize the seed",
        default=-1,
    )
    video: str | None = Field(
        title="Video",
        description="Optional video file for video-to-audio generation",
        default=None,
    )
    prompt: str = Field(
        title="Prompt", description="Text prompt for generated audio", default=""
    )
    duration: float = Field(
        title="Duration", description="Duration of output in seconds", default=8
    )
    num_steps: int = Field(
        title="Num Steps", description="Number of inference steps", default=25
    )
    cfg_strength: float = Field(
        title="Cfg Strength", description="Guidance strength (CFG)", default=4.5
    )
    negative_prompt: str = Field(
        title="Negative Prompt",
        description="Negative prompt to avoid certain sounds",
        default="music",
    )
