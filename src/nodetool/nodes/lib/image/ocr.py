from enum import Enum

from pydantic import Field

from nodetool.workflows.processing_context import ProcessingContext
from nodetool.workflows.base_node import BaseNode
from nodetool.workflows.types import NodeUpdate
from nodetool.workflows.processing_context import ProcessingContext
from nodetool.metadata.types import ImageRef, OCRResult
from paddleocr import PaddleOCR


class OCRLanguage(str, Enum):
    # Latin script languages
    ENGLISH = "en"
    FRENCH = "fr"
    GERMAN = "de"
    SPANISH = "es"
    ITALIAN = "it"
    PORTUGUESE = "pt"
    DUTCH = "nl"
    POLISH = "pl"
    ROMANIAN = "ro"
    CROATIAN = "hr"
    CZECH = "cs"
    HUNGARIAN = "hu"
    SLOVAK = "sk"
    SLOVENIAN = "sl"
    TURKISH = "tr"
    VIETNAMESE = "vi"
    INDONESIAN = "id"
    MALAY = "ms"
    LATIN = "la"

    # Cyrillic script languages
    RUSSIAN = "ru"
    BULGARIAN = "bg"
    UKRAINIAN = "uk"
    BELARUSIAN = "be"
    MONGOLIAN = "mn"

    # CJK languages
    CHINESE = "ch"
    JAPANESE = "ja"
    KOREAN = "ko"

    # Arabic script languages
    ARABIC = "ar"
    PERSIAN = "fa"
    URDU = "ur"

    # Indic scripts
    HINDI = "hi"
    MARATHI = "mr"
    NEPALI = "ne"
    SANSKRIT = "sa"


class PaddleOCRNode(BaseNode):
    """
    Performs Optical Character Recognition (OCR) on images using PaddleOCR.
    image, text, ocr, document

    Use cases:
    - Text extraction from images
    - Document digitization
    - Receipt/invoice processing
    - Handwriting recognition
    """

    image: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The image to perform OCR on",
    )
    language: OCRLanguage = Field(
        default=OCRLanguage.ENGLISH, description="Language code for OCR"
    )

    _ocr: PaddleOCR | None = None

    def required_inputs(self):
        return ["image"]

    @classmethod
    def return_type(cls):
        return {
            "boxes": list[OCRResult],
            "text": str,
        }

    async def initialize(self, context: ProcessingContext):
        context.post_message(
            NodeUpdate(
                node_id=self.id,
                node_name="PaddleOCR",
                status="downloading model",
            )
        )
        self._ocr = PaddleOCR(lang=self.language)

    async def process(self, context: ProcessingContext):
        assert self._ocr is not None
        image = await context.image_to_numpy(self.image)

        result = self._ocr.ocr(image)

        processed_results = []
        for idx in range(len(result)):
            res = result[idx]
            for line in res:
                (top_left, top_right, bottom_right, bottom_left), (text, score) = line
                processed_results.append(
                    OCRResult(
                        text=text,
                        score=float(score),
                        top_left=top_left,
                        top_right=top_right,
                        bottom_right=bottom_right,
                        bottom_left=bottom_left,
                    )
                )

        return {
            "boxes": processed_results,
            "text": "\n".join([result.text for result in processed_results]),
        }
