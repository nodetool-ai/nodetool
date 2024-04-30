from pydantic import BaseModel, Field
from nodetool.metadata.types import *
from nodetool.dsl.graph import GraphNode
from nodetool.common.replicate_node import ReplicateNode
from enum import Enum


class Language(str, Enum):
    AF = "af"
    AM = "am"
    AR = "ar"
    AS = "as"
    AZ = "az"
    BA = "ba"
    BE = "be"
    BG = "bg"
    BN = "bn"
    BO = "bo"
    BR = "br"
    BS = "bs"
    CA = "ca"
    CS = "cs"
    CY = "cy"
    DA = "da"
    DE = "de"
    EL = "el"
    EN = "en"
    ES = "es"
    ET = "et"
    EU = "eu"
    FA = "fa"
    FI = "fi"
    FO = "fo"
    FR = "fr"
    GL = "gl"
    GU = "gu"
    HA = "ha"
    HAW = "haw"
    HE = "he"
    HI = "hi"
    HR = "hr"
    HT = "ht"
    HU = "hu"
    HY = "hy"
    ID = "id"
    IS = "is"
    IT = "it"
    JA = "ja"
    JW = "jw"
    KA = "ka"
    KK = "kk"
    KM = "km"
    KN = "kn"
    KO = "ko"
    LA = "la"
    LB = "lb"
    LN = "ln"
    LO = "lo"
    LT = "lt"
    LV = "lv"
    MG = "mg"
    MI = "mi"
    MK = "mk"
    ML = "ml"
    MN = "mn"
    MR = "mr"
    MS = "ms"
    MT = "mt"
    MY = "my"
    NE = "ne"
    NL = "nl"
    NN = "nn"
    NO = "no"
    OC = "oc"
    PA = "pa"
    PL = "pl"
    PS = "ps"
    PT = "pt"
    RO = "ro"
    RU = "ru"
    SA = "sa"
    SD = "sd"
    SI = "si"
    SK = "sk"
    SL = "sl"
    SN = "sn"
    SO = "so"
    SQ = "sq"
    SR = "sr"
    SU = "su"
    SV = "sv"
    SW = "sw"
    TA = "ta"
    TE = "te"
    TG = "tg"
    TH = "th"
    TK = "tk"
    TL = "tl"
    TR = "tr"
    TT = "tt"
    UK = "uk"
    UR = "ur"
    UZ = "uz"
    VI = "vi"
    YI = "yi"
    YO = "yo"
    YUE = "yue"
    ZH = "zh"
    AFRIKAANS = "Afrikaans"
    ALBANIAN = "Albanian"
    AMHARIC = "Amharic"
    ARABIC = "Arabic"
    ARMENIAN = "Armenian"
    ASSAMESE = "Assamese"
    AZERBAIJANI = "Azerbaijani"
    BASHKIR = "Bashkir"
    BASQUE = "Basque"
    BELARUSIAN = "Belarusian"
    BENGALI = "Bengali"
    BOSNIAN = "Bosnian"
    BRETON = "Breton"
    BULGARIAN = "Bulgarian"
    BURMESE = "Burmese"
    CANTONESE = "Cantonese"
    CASTILIAN = "Castilian"
    CATALAN = "Catalan"
    CHINESE = "Chinese"
    CROATIAN = "Croatian"
    CZECH = "Czech"
    DANISH = "Danish"
    DUTCH = "Dutch"
    ENGLISH = "English"
    ESTONIAN = "Estonian"
    FAROESE = "Faroese"
    FINNISH = "Finnish"
    FLEMISH = "Flemish"
    FRENCH = "French"
    GALICIAN = "Galician"
    GEORGIAN = "Georgian"
    GERMAN = "German"
    GREEK = "Greek"
    GUJARATI = "Gujarati"
    HAITIAN = "Haitian"
    HAITIAN_CREOLE = "Haitian Creole"
    HAUSA = "Hausa"
    HAWAIIAN = "Hawaiian"
    HEBREW = "Hebrew"
    HINDI = "Hindi"
    HUNGARIAN = "Hungarian"
    ICELANDIC = "Icelandic"
    INDONESIAN = "Indonesian"
    ITALIAN = "Italian"
    JAPANESE = "Japanese"
    JAVANESE = "Javanese"
    KANNADA = "Kannada"
    KAZAKH = "Kazakh"
    KHMER = "Khmer"
    KOREAN = "Korean"
    LAO = "Lao"
    LATIN = "Latin"
    LATVIAN = "Latvian"
    LETZEBURGESCH = "Letzeburgesch"
    LINGALA = "Lingala"
    LITHUANIAN = "Lithuanian"
    LUXEMBOURGISH = "Luxembourgish"
    MACEDONIAN = "Macedonian"
    MALAGASY = "Malagasy"
    MALAY = "Malay"
    MALAYALAM = "Malayalam"
    MALTESE = "Maltese"
    MANDARIN = "Mandarin"
    MAORI = "Maori"
    MARATHI = "Marathi"
    MOLDAVIAN = "Moldavian"
    MOLDOVAN = "Moldovan"
    MONGOLIAN = "Mongolian"
    MYANMAR = "Myanmar"
    NEPALI = "Nepali"
    NORWEGIAN = "Norwegian"
    NYNORSK = "Nynorsk"
    OCCITAN = "Occitan"
    PANJABI = "Panjabi"
    PASHTO = "Pashto"
    PERSIAN = "Persian"
    POLISH = "Polish"
    PORTUGUESE = "Portuguese"
    PUNJABI = "Punjabi"
    PUSHTO = "Pushto"
    ROMANIAN = "Romanian"
    RUSSIAN = "Russian"
    SANSKRIT = "Sanskrit"
    SERBIAN = "Serbian"
    SHONA = "Shona"
    SINDHI = "Sindhi"
    SINHALA = "Sinhala"
    SINHALESE = "Sinhalese"
    SLOVAK = "Slovak"
    SLOVENIAN = "Slovenian"
    SOMALI = "Somali"
    SPANISH = "Spanish"
    SUNDANESE = "Sundanese"
    SWAHILI = "Swahili"
    SWEDISH = "Swedish"
    TAGALOG = "Tagalog"
    TAJIK = "Tajik"
    TAMIL = "Tamil"
    TATAR = "Tatar"
    TELUGU = "Telugu"
    THAI = "Thai"
    TIBETAN = "Tibetan"
    TURKISH = "Turkish"
    TURKMEN = "Turkmen"
    UKRAINIAN = "Ukrainian"
    URDU = "Urdu"
    UZBEK = "Uzbek"
    VALENCIAN = "Valencian"
    VIETNAMESE = "Vietnamese"
    WELSH = "Welsh"
    YIDDISH = "Yiddish"
    YORUBA = "Yoruba"


class Transcription(str, Enum):
    PLAIN_TEXT = "plain text"
    SRT = "srt"
    VTT = "vtt"


class Whisper(ReplicateNode):
    """Convert speech in audio to text"""

    def replicate_model_id(self):
        return "openai/whisper:4d50797290df275329f202e48c76360b3f22b08d28c196cbc54600319435f8d2"

    def get_hardware(self):
        return "Nvidia T4 (High-memory) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/a9253a5b-aa79-4df3-8aa1-09a6d044fdd6/Screen_Shot_2022-09-28_at_16.58.5.png",
            "created_at": "2022-09-22T10:01:42.119733Z",
            "description": "Convert speech in audio to text",
            "github_url": "https://github.com/replicate/cog-whisper",
            "license_url": "https://github.com/openai/whisper/blob/main/LICENSE",
            "name": "whisper",
            "owner": "openai",
            "paper_url": "https://cdn.openai.com/papers/whisper.pdf",
            "run_count": 6339499,
            "url": "https://replicate.com/openai/whisper",
            "visibility": "public",
            "hardware": "Nvidia T4 (High-memory) GPU",
        }

    @classmethod
    def return_type(cls):
        return str

    audio: AudioRef = Field(default=AudioRef(), description="Audio file")
    model: str = Field(
        title="Model",
        description="This version only supports Whisper-large-v3.",
        default="large-v3",
    )
    language: Language = Field(
        description="language spoken in the audio, specify None to perform language detection",
        default=None,
    )
    patience: float | None = Field(
        title="Patience",
        description="optional patience value to use in beam decoding, as in https://arxiv.org/abs/2204.05424, the default (1.0) is equivalent to conventional beam search",
        default=None,
    )
    translate: bool = Field(
        title="Translate",
        description="Translate the text to English when set to True",
        default=False,
    )
    temperature: float = Field(
        title="Temperature", description="temperature to use for sampling", default=0
    )
    transcription: Transcription = Field(
        description="Choose the format for the transcription", default="plain text"
    )
    initial_prompt: str | None = Field(
        title="Initial Prompt",
        description="optional text to provide as a prompt for the first window.",
        default=None,
    )
    suppress_tokens: str = Field(
        title="Suppress Tokens",
        description="comma-separated list of token ids to suppress during sampling; '-1' will suppress most special characters except common punctuations",
        default="-1",
    )
    logprob_threshold: float = Field(
        title="Logprob Threshold",
        description="if the average log probability is lower than this value, treat the decoding as failed",
        default=-1,
    )
    no_speech_threshold: float = Field(
        title="No Speech Threshold",
        description="if the probability of the <|nospeech|> token is higher than this value AND the decoding has failed due to `logprob_threshold`, consider the segment as silence",
        default=0.6,
    )
    condition_on_previous_text: bool = Field(
        title="Condition On Previous Text",
        description="if True, provide the previous output of the model as a prompt for the next window; disabling may make the text inconsistent across windows, but the model becomes less prone to getting stuck in a failure loop",
        default=True,
    )
    compression_ratio_threshold: float = Field(
        title="Compression Ratio Threshold",
        description="if the gzip compression ratio is higher than this value, treat the decoding as failed",
        default=2.4,
    )
    temperature_increment_on_fallback: float = Field(
        title="Temperature Increment On Fallback",
        description="temperature to increase when falling back when the decoding fails to meet either of the thresholds below",
        default=0.2,
    )


class Task(str, Enum):
    TRANSCRIBE = "transcribe"
    TRANSLATE = "translate"


class Timestamp(str, Enum):
    CHUNK = "chunk"
    WORD = "word"


class IncrediblyFastWhisper(ReplicateNode):
    """whisper-large-v3, incredibly fast, powered by Hugging Face Transformers! 🤗"""

    def replicate_model_id(self):
        return "vaibhavs10/incredibly-fast-whisper:3ab86df6c8f54c11309d4d1f930ac292bad43ace52d10c80d87eb258b3c9f79c"

    def get_hardware(self):
        return "Nvidia A40 (Large) GPU"

    @classmethod
    def model_info(cls):
        return {
            "cover_image_url": "https://tjzk.replicate.delivery/models_models_cover_image/a59dc78f-523f-4977-9856-e84479aec79b/insanely-fast-whisper-img.png",
            "created_at": "2023-11-13T13:28:53.689979Z",
            "description": "whisper-large-v3, incredibly fast, powered by Hugging Face Transformers! 🤗",
            "github_url": "https://github.com/chenxwh/insanely-fast-whisper",
            "license_url": "https://github.com/Vaibhavs10/insanely-fast-whisper/blob/main/LICENSE",
            "name": "incredibly-fast-whisper",
            "owner": "vaibhavs10",
            "paper_url": None,
            "run_count": 300039,
            "url": "https://replicate.com/vaibhavs10/incredibly-fast-whisper",
            "visibility": "public",
            "hardware": "Nvidia A40 (Large) GPU",
        }

    @classmethod
    def return_type(cls):
        return str

    task: Task = Field(
        description="Task to perform: transcribe or translate to another language.",
        default="transcribe",
    )
    audio: AudioRef = Field(default=AudioRef(), description="Audio file")
    hf_token: str | None = Field(
        title="Hf Token",
        description="Provide a hf.co/settings/token for Pyannote.audio to diarise the audio clips. You need to agree to the terms in 'https://huggingface.co/pyannote/speaker-diarization-3.1' and 'https://huggingface.co/pyannote/segmentation-3.0' first.",
        default=None,
    )
    language: Language = Field(
        description="Language spoken in the audio, specify 'None' to perform language detection.",
        default="None",
    )
    timestamp: Timestamp = Field(
        description="Whisper supports both chunked as well as word level timestamps.",
        default="chunk",
    )
    batch_size: int = Field(
        title="Batch Size",
        description="Number of parallel batches you want to compute. Reduce if you face OOMs.",
        default=24,
    )
    diarise_audio: bool = Field(
        title="Diarise Audio",
        description="Use Pyannote.audio to diarise the audio clips. You will need to provide hf_token below too.",
        default=False,
    )
