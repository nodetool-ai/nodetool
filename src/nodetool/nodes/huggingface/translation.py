import torch
from nodetool.metadata.types import HFTranslation
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field
from enum import Enum
from transformers import PreTrainedModel, Pipeline
import logging
from typing import List, Optional, Union, Iterable
from collections.abc import Generator

# Configure logging
logger = logging.getLogger(__name__)
logging.basicConfig(level=logging.INFO)


class Translation(HuggingFacePipelineNode):
    """
    Translates text from one language to another.
    text, translation, natural language processing

    Use cases:
    - Multilingual content creation
    - Cross-language communication
    - Localization of applications and websites

    Note: some models support more languages than others.
    """

    class LanguageCode(str, Enum):
        ARABIC = "ar"
        BENGALI = "bn"
        BOSNIAN = "bs"
        CHINESE = "zh"
        CROATIAN = "hr"
        CZECH = "cs"
        DANISH = "da"
        DUTCH = "nl"
        ENGLISH = "en"
        FILIPINO = "fil"
        FINNISH = "fi"
        FRENCH = "fr"
        GERMAN = "de"
        GREEK = "el"
        HEBREW = "he"
        HINDI = "hi"
        INDONESIAN = "id"
        ITALIAN = "it"
        JAPANESE = "ja"
        KOREAN = "ko"
        MALAY = "ms"
        MONTENEGRIN = "me"
        NORWEGIAN = "no"
        POLISH = "pl"
        PORTUGUESE = "pt"
        PUNJABI = "pa"
        RUSSIAN = "ru"
        ROMANIAN = "ro"
        SERBIAN = "sr"
        SLOVAK = "sk"
        SLOVENIAN = "sl"
        SPANISH = "es"
        SWEDISH = "sv"
        THAI = "th"
        TURKISH = "tr"
        VIETNAMESE = "vi"

    model: HFTranslation = Field(
        default=HFTranslation(),
        title="Model ID on HuggingFace",
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

    _pipeline: Optional[Pipeline] = None  # Type annotation for the pipeline

    @classmethod
    def get_recommended_models(cls) -> List[HFTranslation]:
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
        """
        Initializes the translation pipeline by loading the specified model.
        """
        try:
            self._pipeline = await self.load_pipeline(
                context, self.pipeline_task, self.model.repo_id
            )
            logger.info(f"Pipeline loaded with model {self.model.repo_id}")
        except Exception as e:
            logger.error(f"Error loading pipeline: {e}")
            raise RuntimeError(f"Failed to load pipeline: {e}") from e

    @property
    def pipeline_task(self) -> str:
        """
        Constructs the pipeline task string based on source and target languages.
        """
        return f"translation_{self.source_lang.value}_to_{self.target_lang.value}"

    async def process(self, context: ProcessingContext) -> str:
        """
        Processes the input text through the translation pipeline and returns the translated text.
        """
        if self._pipeline is None:
            raise ValueError("Pipeline is not initialized.")

        try:
            # Invoke the pipeline
            result = self._pipeline(
                self.inputs,
                src_lang=self.source_lang.value,
                tgt_lang=self.target_lang.value,
            )

            if result is None:
                raise ValueError("Translation result is None.")

            # Handle different types of result
            if isinstance(result, dict):
                result = [result]
            elif isinstance(result, (Generator, Iterable)) and not isinstance(result, list):
                result = list(result)
            elif not isinstance(result, list):
                result = [result]

            if not result:
                raise ValueError("Translation result is empty.")

            # Get the first item
            first_result = result[0]

            if isinstance(first_result, dict):
                translation_text = first_result.get("translation_text")
                if not translation_text:
                    raise ValueError("No 'translation_text' found in the result.")
                return translation_text
            elif isinstance(first_result, str):
                return first_result
            else:
                raise TypeError(f"Unexpected result type: {type(first_result)}")

        except Exception as e:
            logger.error(f"Error during translation: {e}")
            raise RuntimeError(f"Failed to process translation: {e}") from e

    async def move_to_device(self, target_device_str: str):
        """
        Moves the pipeline's model and components to the specified device.

        Args:
            target_device_str (str): The target device (e.g., "cpu", "cuda", "cuda:0").
        """
        if self._pipeline is None:
            raise ValueError("Pipeline is not initialized.")

        try:
            # Convert device string to torch.device
            target_device = torch.device(target_device_str)

            # Set the device attribute of the pipeline
            self._pipeline.device = target_device
            logger.info(f"Pipeline device set to {target_device}")

            # Rename local variable to avoid conflict with self.model
            pipeline_model = getattr(self._pipeline, 'model', None)
            if isinstance(pipeline_model, PreTrainedModel):
                pipeline_model.to(target_device)
                logger.info(f"Model moved to {target_device}")
            else:
                logger.warning(f"Pipeline model is not a PreTrainedModel, got {type(pipeline_model)}")

            # Move other components if they support the .to() method
            for attr_name in ['tokenizer', 'feature_extractor']:
                component = getattr(self._pipeline, attr_name, None)
                if component and hasattr(component, 'to') and callable(getattr(component, 'to')):
                    component.to(target_device)
                    logger.info(f"{attr_name.capitalize()} moved to {target_device}")

        except Exception as e:
            logger.error(f"Error moving pipeline to device {target_device_str}: {e}")
            raise RuntimeError(f"Failed to move pipeline to device {target_device_str}: {e}") from e

