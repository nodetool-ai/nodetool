from nodetool.metadata.types import HFTranslation
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


from pydantic import Field


from enum import Enum


class Translation(HuggingFacePipelineNode):
    """
    Translates text from one language to another.
    text, translation, natural language processing

    Use cases:
    - Multilingual content creation
    - Cross-language communication
    - Localization of applications and websites
    - International market research
    """

    class LanguageCode(str, Enum):
        ENGLISH = "en"
        FRENCH = "fr"
        GERMAN = "de"
        SPANISH = "es"
        ITALIAN = "it"
        DUTCH = "nl"
        PORTUGUESE = "pt"
        RUSSIAN = "ru"
        CHINESE = "zh"
        SWEDISH = "sv"
        NORWEGIAN = "no"
        DANISH = "da"
        FINNISH = "fi"
        POLISH = "pl"
        CZECH = "cs"
        SLOVAK = "sk"
        SLOVENIAN = "sl"
        CROATIAN = "hr"
        SERBIAN = "sr"
        BOSNIAN = "bs"
        MONTENEGRIN = "me"
        ARABIC = "ar"
        HEBREW = "he"
        TURKISH = "tr"
        GREEK = "el"
        HINDI = "hi"
        BENGALI = "bn"
        PUNJABI = "pa"
        THAI = "th"
        VIETNAMESE = "vi"
        INDONESIAN = "id"
        MALAY = "ms"
        FILIPINO = "fil"
        KOERAN = "ko"
        JAPANESE = "ja"

    model: HFTranslation = Field(
        default=HFTranslation(),
        title="Model ID on Huggingface",
        description="The model ID to use for translation",
    )
    inputs: str = Field(
        default="",
        title="Input Text",
        description="The text to translate",
    )
    source_lang: LanguageCode = Field(
        default=LanguageCode.ENGLISH,
        title="Source Language",
        description="The source language code (e.g., 'en' for English)",
    )
    target_lang: LanguageCode = Field(
        default=LanguageCode.FRENCH,
        title="Target Language",
        description="The target language code (e.g., 'fr' for French)",
    )

    @classmethod
    def get_recommended_models(cls) -> list[HFTranslation]:
        return [
            HFTranslation(
                repo_id="google-t5/t5-base",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTranslation(
                repo_id="google-t5/t5-large",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
            HFTranslation(
                repo_id="google-t5/t5-small",
                allow_patterns=["*.json", "*.txt", "*.safetensors"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context, self.pipeline_task, self.model.repo_id
        )

    @property
    def pipeline_task(self) -> str:
        return f"translation_{self.source_lang}_to_{self.target_lang}"

    async def process(self, context: ProcessingContext) -> str:
        assert self._pipeline is not None
        result = self._pipeline(
            self.inputs, src_lang=self.source_lang, tgt_lang=self.target_lang
        )
        assert result is not None
        return result[0]["translation_text"]  # type: ignore
