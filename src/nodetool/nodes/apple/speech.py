from enum import Enum
from pydantic import Field
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import TextRef
from nodetool.nodes.apple import IS_MACOS

if IS_MACOS:
    import AppKit  # type: ignore

    # Get all available voices
    # voices = AppKit.NSSpeechSynthesizer.availableVoices()
    # for voice in voices:
    #     # Get the voice attributes
    #     attrs = AppKit.NSSpeechSynthesizer.attributesForVoice_(voice)
    #     name = attrs["VoiceName"]
    #     language = attrs["VoiceLanguage"]
    #     print(f"Voice ID: {voice}")
    #     print(f"Name: {name}")
    #     print(f"Language: {language}")
    #     print("---")


class MacOSVoice(str, Enum):
    """MacOS Text-to-Speech voices organized by language"""

    # English (US)
    ALBERT = "com.apple.speech.synthesis.voice.Albert"
    BAD_NEWS = "com.apple.speech.synthesis.voice.BadNews"
    GOOD_NEWS = "com.apple.speech.synthesis.voice.GoodNews"
    FRED = "com.apple.speech.synthesis.voice.Fred"
    JUNIOR = "com.apple.speech.synthesis.voice.Junior"
    KATHY = "com.apple.speech.synthesis.voice.Kathy"
    RALPH = "com.apple.speech.synthesis.voice.Ralph"
    SAMANTHA = "com.apple.voice.compact.en-US.Samantha"

    # English (Other Regions)
    DANIEL = "com.apple.voice.compact.en-GB.Daniel"  # UK
    KAREN = "com.apple.voice.compact.en-AU.Karen"  # Australia
    MOIRA = "com.apple.voice.compact.en-IE.Moira"  # Ireland
    RISHI = "com.apple.voice.compact.en-IN.Rishi"  # India
    TESSA = "com.apple.voice.compact.en-ZA.Tessa"  # South Africa

    # Asian Languages
    DAMAYANTI = "com.apple.voice.compact.id-ID.Damayanti"  # Indonesian
    KANYA = "com.apple.voice.compact.th-TH.Kanya"  # Thai
    KYOKO = "com.apple.voice.compact.ja-JP.Kyoko"  # Japanese
    LEKHA = "com.apple.voice.compact.hi-IN.Lekha"  # Hindi
    LINH = "com.apple.voice.compact.vi-VN.Linh"  # Vietnamese
    MEIJIA = "com.apple.voice.compact.zh-TW.Meijia"  # Chinese (Taiwan)
    SINJI = "com.apple.voice.compact.zh-HK.Sinji"  # Chinese (Hong Kong)
    TINGTING = "com.apple.voice.compact.zh-CN.Tingting"  # Chinese (Mainland)
    YUNA = "com.apple.voice.compact.ko-KR.Yuna"  # Korean

    # European Languages
    ALICE = "com.apple.voice.compact.it-IT.Alice"  # Italian
    ALVA = "com.apple.voice.compact.sv-SE.Alva"  # Swedish
    ANNA = "com.apple.voice.compact.de-DE.Anna"  # German
    CARMIT = "com.apple.voice.compact.he-IL.Carmit"  # Hebrew
    DARIA = "com.apple.voice.compact.bg-BG.Daria"  # Bulgarian
    ELLEN = "com.apple.voice.compact.nl-BE.Ellen"  # Dutch (Belgium)
    IOANA = "com.apple.voice.compact.ro-RO.Ioana"  # Romanian
    JOANA = "com.apple.voice.compact.pt-PT.Joana"  # Portuguese
    LANA = "com.apple.voice.compact.hr-HR.Lana"  # Croatian
    LAURA = "com.apple.voice.compact.sk-SK.Laura"  # Slovak
    LESYA = "com.apple.voice.compact.uk-UA.Lesya"  # Ukrainian
    LUCIANA = "com.apple.voice.compact.pt-BR.Luciana"  # Portuguese (Brazil)
    MARISKA = "com.apple.voice.compact.hu-HU.Mariska"  # Hungarian
    MELINA = "com.apple.voice.compact.el-GR.Melina"  # Greek
    MILENA = "com.apple.voice.compact.ru-RU.Milena"  # Russian
    MONICA = "com.apple.voice.compact.es-ES.Monica"  # Spanish (Spain)
    MONTSERRAT = "com.apple.voice.compact.ca-ES.Montserrat"  # Catalan
    NORA = "com.apple.voice.compact.nb-NO.Nora"  # Norwegian
    PAULINA = "com.apple.voice.compact.es-MX.Paulina"  # Spanish (Mexico)
    SARA = "com.apple.voice.compact.da-DK.Sara"  # Danish
    SATU = "com.apple.voice.compact.fi-FI.Satu"  # Finnish
    THOMAS = "com.apple.voice.compact.fr-FR.Thomas"  # French
    TINA = "com.apple.voice.compact.sl-SI.Tina"  # Slovenian
    XANDER = "com.apple.voice.compact.nl-NL.Xander"  # Dutch
    YELDA = "com.apple.voice.compact.tr-TR.Yelda"  # Turkish
    ZOSIA = "com.apple.voice.compact.pl-PL.Zosia"  # Polish
    ZUZANA = "com.apple.voice.compact.cs-CZ.Zuzana"  # Czech

    # Arabic and Indian Languages
    AMIRA = "com.apple.voice.compact.ms-MY.Amira"  # Malay
    MAGED = "com.apple.voice.compact.ar-001.Maged"  # Arabic

    # French Regional
    AMELIE = "com.apple.voice.compact.fr-CA.Amelie"  # French (Canada)
    JACQUES = "com.apple.eloquence.fr-FR.Jacques"  # French

    # Fun/Effect Voices
    BAHH = "com.apple.speech.synthesis.voice.Bahh"
    BELLS = "com.apple.speech.synthesis.voice.Bells"
    BOING = "com.apple.speech.synthesis.voice.Boing"
    BUBBLES = "com.apple.speech.synthesis.voice.Bubbles"
    CELLOS = "com.apple.speech.synthesis.voice.Cellos"
    DERANGED = "com.apple.speech.synthesis.voice.Deranged"
    HYSTERICAL = "com.apple.speech.synthesis.voice.Hysterical"
    ORGAN = "com.apple.speech.synthesis.voice.Organ"
    PRINCESS = "com.apple.speech.synthesis.voice.Princess"
    TRINOIDS = "com.apple.speech.synthesis.voice.Trinoids"
    WHISPER = "com.apple.speech.synthesis.voice.Whisper"
    ZARVOX = "com.apple.speech.synthesis.voice.Zarvox"

    # Eloquence Voices (Multiple Languages)
    EDDY_DE = "com.apple.eloquence.de-DE.Eddy"
    EDDY_EN_GB = "com.apple.eloquence.en-GB.Eddy"
    EDDY_EN_US = "com.apple.eloquence.en-US.Eddy"
    EDDY_ES_ES = "com.apple.eloquence.es-ES.Eddy"
    EDDY_ES_MX = "com.apple.eloquence.es-MX.Eddy"
    EDDY_FI = "com.apple.eloquence.fi-FI.Eddy"
    EDDY_FR_CA = "com.apple.eloquence.fr-CA.Eddy"
    EDDY_FR_FR = "com.apple.eloquence.fr-FR.Eddy"
    EDDY_IT = "com.apple.eloquence.it-IT.Eddy"
    EDDY_JA = "com.apple.eloquence.ja-JP.Eddy"
    EDDY_KO = "com.apple.eloquence.ko-KR.Eddy"
    EDDY_PT_BR = "com.apple.eloquence.pt-BR.Eddy"
    EDDY_ZH_CN = "com.apple.eloquence.zh-CN.Eddy"
    EDDY_ZH_TW = "com.apple.eloquence.zh-TW.Eddy"

    FLO_DE = "com.apple.eloquence.de-DE.Flo"
    FLO_EN_GB = "com.apple.eloquence.en-GB.Flo"
    FLO_EN_US = "com.apple.eloquence.en-US.Flo"
    FLO_ES_ES = "com.apple.eloquence.es-ES.Flo"
    FLO_ES_MX = "com.apple.eloquence.es-MX.Flo"
    FLO_FI = "com.apple.eloquence.fi-FI.Flo"
    FLO_FR_CA = "com.apple.eloquence.fr-CA.Flo"
    FLO_FR_FR = "com.apple.eloquence.fr-FR.Flo"
    FLO_IT = "com.apple.eloquence.it-IT.Flo"
    FLO_JA = "com.apple.eloquence.ja-JP.Flo"
    FLO_KO = "com.apple.eloquence.ko-KR.Flo"
    FLO_PT_BR = "com.apple.eloquence.pt-BR.Flo"
    FLO_ZH_CN = "com.apple.eloquence.zh-CN.Flo"
    FLO_ZH_TW = "com.apple.eloquence.zh-TW.Flo"

    GRANDMA_DE = "com.apple.eloquence.de-DE.Grandma"
    GRANDMA_EN_GB = "com.apple.eloquence.en-GB.Grandma"
    GRANDMA_EN_US = "com.apple.eloquence.en-US.Grandma"
    GRANDMA_ES_ES = "com.apple.eloquence.es-ES.Grandma"
    GRANDMA_ES_MX = "com.apple.eloquence.es-MX.Grandma"
    GRANDMA_FI = "com.apple.eloquence.fi-FI.Grandma"
    GRANDMA_FR_CA = "com.apple.eloquence.fr-CA.Grandma"
    GRANDMA_FR_FR = "com.apple.eloquence.fr-FR.Grandma"
    GRANDMA_IT = "com.apple.eloquence.it-IT.Grandma"
    GRANDMA_JA = "com.apple.eloquence.ja-JP.Grandma"
    GRANDMA_KO = "com.apple.eloquence.ko-KR.Grandma"
    GRANDMA_PT_BR = "com.apple.eloquence.pt-BR.Grandma"
    GRANDMA_ZH_CN = "com.apple.eloquence.zh-CN.Grandma"
    GRANDMA_ZH_TW = "com.apple.eloquence.zh-TW.Grandma"

    GRANDPA_DE = "com.apple.eloquence.de-DE.Grandpa"
    GRANDPA_EN_GB = "com.apple.eloquence.en-GB.Grandpa"
    GRANDPA_EN_US = "com.apple.eloquence.en-US.Grandpa"
    GRANDPA_ES_ES = "com.apple.eloquence.es-ES.Grandpa"
    GRANDPA_ES_MX = "com.apple.eloquence.es-MX.Grandpa"
    GRANDPA_FI = "com.apple.eloquence.fi-FI.Grandpa"
    GRANDPA_FR_CA = "com.apple.eloquence.fr-CA.Grandpa"
    GRANDPA_FR_FR = "com.apple.eloquence.fr-FR.Grandpa"
    GRANDPA_IT = "com.apple.eloquence.it-IT.Grandpa"
    GRANDPA_JA = "com.apple.eloquence.ja-JP.Grandpa"
    GRANDPA_KO = "com.apple.eloquence.ko-KR.Grandpa"
    GRANDPA_PT_BR = "com.apple.eloquence.pt-BR.Grandpa"
    GRANDPA_ZH_CN = "com.apple.eloquence.zh-CN.Grandpa"
    GRANDPA_ZH_TW = "com.apple.eloquence.zh-TW.Grandpa"

    REED_DE = "com.apple.eloquence.de-DE.Reed"
    REED_EN_GB = "com.apple.eloquence.en-GB.Reed"
    REED_EN_US = "com.apple.eloquence.en-US.Reed"
    REED_ES_ES = "com.apple.eloquence.es-ES.Reed"
    REED_ES_MX = "com.apple.eloquence.es-MX.Reed"
    REED_FI = "com.apple.eloquence.fi-FI.Reed"
    REED_FR_CA = "com.apple.eloquence.fr-CA.Reed"
    REED_IT = "com.apple.eloquence.it-IT.Reed"
    REED_JA = "com.apple.eloquence.ja-JP.Reed"
    REED_KO = "com.apple.eloquence.ko-KR.Reed"
    REED_PT_BR = "com.apple.eloquence.pt-BR.Reed"
    REED_ZH_CN = "com.apple.eloquence.zh-CN.Reed"
    REED_ZH_TW = "com.apple.eloquence.zh-TW.Reed"

    ROCKO_DE = "com.apple.eloquence.de-DE.Rocko"
    ROCKO_EN_GB = "com.apple.eloquence.en-GB.Rocko"
    ROCKO_EN_US = "com.apple.eloquence.en-US.Rocko"
    ROCKO_ES_ES = "com.apple.eloquence.es-ES.Rocko"
    ROCKO_ES_MX = "com.apple.eloquence.es-MX.Rocko"
    ROCKO_FI = "com.apple.eloquence.fi-FI.Rocko"
    ROCKO_FR_CA = "com.apple.eloquence.fr-CA.Rocko"
    ROCKO_FR_FR = "com.apple.eloquence.fr-FR.Rocko"
    ROCKO_IT = "com.apple.eloquence.it-IT.Rocko"
    ROCKO_JA = "com.apple.eloquence.ja-JP.Rocko"
    ROCKO_KO = "com.apple.eloquence.ko-KR.Rocko"
    ROCKO_PT_BR = "com.apple.eloquence.pt-BR.Rocko"
    ROCKO_ZH_CN = "com.apple.eloquence.zh-CN.Rocko"
    ROCKO_ZH_TW = "com.apple.eloquence.zh-TW.Rocko"

    SANDY_DE = "com.apple.eloquence.de-DE.Sandy"
    SANDY_EN_GB = "com.apple.eloquence.en-GB.Sandy"
    SANDY_EN_US = "com.apple.eloquence.en-US.Sandy"
    SANDY_ES_ES = "com.apple.eloquence.es-ES.Sandy"
    SANDY_ES_MX = "com.apple.eloquence.es-MX.Sandy"
    SANDY_FI = "com.apple.eloquence.fi-FI.Sandy"
    SANDY_FR_CA = "com.apple.eloquence.fr-CA.Sandy"
    SANDY_FR_FR = "com.apple.eloquence.fr-FR.Sandy"
    SANDY_IT = "com.apple.eloquence.it-IT.Sandy"
    SANDY_JA = "com.apple.eloquence.ja-JP.Sandy"
    SANDY_KO = "com.apple.eloquence.ko-KR.Sandy"
    SANDY_PT_BR = "com.apple.eloquence.pt-BR.Sandy"
    SANDY_ZH_CN = "com.apple.eloquence.zh-CN.Sandy"
    SANDY_ZH_TW = "com.apple.eloquence.zh-TW.Sandy"

    SHELLEY_DE = "com.apple.eloquence.de-DE.Shelley"
    SHELLEY_EN_GB = "com.apple.eloquence.en-GB.Shelley"
    SHELLEY_EN_US = "com.apple.eloquence.en-US.Shelley"
    SHELLEY_ES_ES = "com.apple.eloquence.es-ES.Shelley"
    SHELLEY_ES_MX = "com.apple.eloquence.es-MX.Shelley"
    SHELLEY_FI = "com.apple.eloquence.fi-FI.Shelley"
    SHELLEY_FR_CA = "com.apple.eloquence.fr-CA.Shelley"
    SHELLEY_FR_FR = "com.apple.eloquence.fr-FR.Shelley"
    SHELLEY_IT = "com.apple.eloquence.it-IT.Shelley"
    SHELLEY_JA = "com.apple.eloquence.ja-JP.Shelley"
    SHELLEY_KO = "com.apple.eloquence.ko-KR.Shelley"
    SHELLEY_PT_BR = "com.apple.eloquence.pt-BR.Shelley"
    SHELLEY_ZH_CN = "com.apple.eloquence.zh-CN.Shelley"
    SHELLEY_ZH_TW = "com.apple.eloquence.zh-TW.Shelley"


class SayText(BaseNode):
    """
    Speak text using macOS's built-in text-to-speech
    speech, automation, macos, accessibility

    Use cases:
    - Add voice notifications to workflows
    - Create audio feedback
    - Accessibility features
    """

    text: str = Field(default="", description="Text to be spoken")
    rate: float = Field(
        default=175.0, le=300, ge=10, description="Speaking rate (words per minute)"
    )
    volume: float = Field(
        default=1.0, le=1.0, ge=0.0, description="Volume level (0.0 to 1.0)"
    )
    voice: MacOSVoice = Field(default=MacOSVoice.ALBERT, description="Voice identifier")

    @classmethod
    def is_cacheable(cls) -> bool:
        return False

    async def process(self, context: ProcessingContext) -> bool:
        if not IS_MACOS:
            raise NotImplementedError("Speech functionality is only available on macOS")
        try:
            synthesizer = AppKit.NSSpeechSynthesizer.alloc().init()  # type: ignore
            if self.voice:
                synthesizer.setVoice_(self.voice)
            synthesizer.setRate_(self.rate)
            synthesizer.setVolume_(self.volume)
            synthesizer.startSpeakingString_(self.text)
            return True
        except Exception as e:
            print(f"Speech synthesis failed with error: {e}")
            return False
