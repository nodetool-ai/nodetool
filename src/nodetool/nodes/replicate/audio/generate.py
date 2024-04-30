from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


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


class RealisticVoiceCloning(ReplicateNode):
    """Create song covers with any RVC v2 trained AI voice from audio files."""

    def replicate_model_id(self):
        return "zsxkib/realistic-voice-cloning:0a9c7c558af4c0f20667c1bd1260ce32a2879944a0b9e44e1398660c077b1550"

    def get_hardware(self):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/7a110507-8a38-4fcb-8826-61aec80309cb/Out_0_1024x1024.png",
            "created_at": "2023-11-09T16:32:42.062982Z",
            "description": "Create song covers with any RVC v2 trained AI voice from audio files.",
            "github_url": "https://github.com/zsxkib/AICoverGen.git",
            "license_url": "https://github.com/SociallyIneptWeeb/AICoverGen/blob/main/LICENSE",
            "name": "realistic-voice-cloning",
            "owner": "zsxkib",
            "paper_url": None,
            "run_count": 152189,
            "url": "https://replicate.com/zsxkib/realistic-voice-cloning",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
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
        default="Squidward",
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
        default="no-change",
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
        default="mp3",
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
        default="rmvpe",
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


class Riffusion(ReplicateNode):
    """Stable diffusion for real-time music generation"""

    def replicate_model_id(self):
        return "riffusion/riffusion:8cf61ea6c56afd61d8f5b9ffd14d7c216c0a93844ce2d82ac1c9ecc9c7f24e05"

    def get_hardware(self):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/4f67b4e2-4df3-4ce9-9b80-00bbf5a186d8/riffusion.gif",
            "created_at": "2022-12-16T07:31:34.983811Z",
            "description": "Stable diffusion for real-time music generation",
            "github_url": "https://github.com/riffusion/riffusion",
            "license_url": "https://github.com/riffusion/riffusion/blob/main/LICENSE",
            "name": "riffusion",
            "owner": "riffusion",
            "paper_url": "https://www.riffusion.com/about",
            "run_count": 903456,
            "url": "https://replicate.com/riffusion/riffusion",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
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
        description="Seed spectrogram to use", default="vibes"
    )
    num_inference_steps: int = Field(
        title="Num Inference Steps",
        description="Number of steps to run the diffusion model",
        ge=1.0,
        default=50,
    )


class History_prompt(str, Enum):
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


class Bark(ReplicateNode):
    """🔊 Text-Prompted Generative Audio Model"""

    def replicate_model_id(self):
        return "suno-ai/bark:b76242b40d67c76ab6742e987628a2a9ac019e11d56ab96c4e91ce03b79b2787"

    def get_hardware(self):
        return "Nvidia T4 GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/9fbbe7c2-beb0-4caa-bd59-647dd7eeee6b/fofr_dog.jpg",
            "created_at": "2023-04-25T20:56:39.740033Z",
            "description": "🔊 Text-Prompted Generative Audio Model",
            "github_url": "https://github.com/chenxwh/bark",
            "license_url": "https://github.com/suno-ai/bark/blob/main/LICENSE",
            "name": "bark",
            "owner": "suno-ai",
            "paper_url": None,
            "run_count": 224454,
            "url": "https://replicate.com/suno-ai/bark",
            "visibility": "public",
            "hardware": "Nvidia T4 GPU",
        }

    @classmethod
    def return_type(cls):
        return AudioRef

    def output_key(self):
        return "audio_out"

    prompt: str = Field(
        title="Prompt",
        description="Input prompt",
        default="Hello, my name is Suno. And, uh — and I like pizza. [laughs] But I also have other interests such as playing tic tac toe.",
    )
    text_temp: float = Field(
        title="Text Temp",
        description="generation temperature (1.0 more diverse, 0.0 more conservative)",
        default=0.7,
    )
    output_full: bool = Field(
        title="Output Full",
        description="return full generation as a .npz file to be used as a history prompt",
        default=False,
    )
    waveform_temp: float = Field(
        title="Waveform Temp",
        description="generation temperature (1.0 more diverse, 0.0 more conservative)",
        default=0.7,
    )
    history_prompt: History_prompt = Field(
        description="history choice for audio cloning, choose from the list",
        default=None,
    )
    custom_history_prompt: str | None = Field(
        title="Custom History Prompt",
        description="Provide your own .npz file with history choice for audio cloning, this will override the previous history_prompt setting",
        default=None,
    )


class Model_version(str, Enum):
    STEREO_MELODY_LARGE = "stereo-melody-large"
    STEREO_LARGE = "stereo-large"
    MELODY_LARGE = "melody-large"
    LARGE = "large"


class Normalization_strategy(str, Enum):
    LOUDNESS = "loudness"
    CLIP = "clip"
    PEAK = "peak"
    RMS = "rms"


class MusicGen(ReplicateNode):
    """Generate music from a prompt or melody"""

    def replicate_model_id(self):
        return "meta/musicgen:671ac645ce5e552cc63a54a2bbff63fcf798043055d2dac5fc9e36a837eedcfb"

    def get_hardware(self):
        return "Nvidia A100 (40GB) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/e3d6b391-571b-4e24-8531-936a0fee9fba/musicgen.jpeg",
            "created_at": "2023-06-12T19:22:05.525230Z",
            "description": "Generate music from a prompt or melody",
            "github_url": "https://github.com/replicate/cog-musicgen",
            "license_url": "https://github.com/facebookresearch/audiocraft/blob/main/LICENSE_weights",
            "name": "musicgen",
            "owner": "meta",
            "paper_url": "https://arxiv.org/abs/2306.05284",
            "run_count": 1599025,
            "url": "https://replicate.com/meta/musicgen",
            "visibility": "public",
            "hardware": "Nvidia A100 (40GB) GPU",
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
        description="Model to use for generation", default="stereo-melody-large"
    )
    output_format: Output_format = Field(
        description="Output format for generated audio.", default="wav"
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
        description="Strategy for normalizing audio.", default="loudness"
    )
    classifier_free_guidance: int = Field(
        title="Classifier Free Guidance",
        description="Increases the influence of inputs on the output. Higher values produce lower-varience outputs that adhere more closely to inputs.",
        default=3,
    )
