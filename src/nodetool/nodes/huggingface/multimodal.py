from pydantic import Field
from nodetool.metadata.types import (
    ImageRef,
    HFVisualQuestionAnswering,
    HFImageToText,
    OCRResult,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext
import numpy as np
from paddleocr import PaddleOCR

from nodetool.workflows.types import NodeUpdate


class ImageToText(HuggingFacePipelineNode):
    """
    Generates text descriptions from images.
    image, text, captioning, vision-language

    Use cases:
    - Automatic image captioning
    - Assisting visually impaired users
    - Enhancing image search capabilities
    - Generating alt text for web images
    """

    model: HFImageToText = Field(
        default=HFImageToText(),
        title="Model ID on Huggingface",
        description="The model ID to use for image-to-text generation",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The image to generate text from",
    )
    max_new_tokens: int = Field(
        default=50,
        title="Max New Tokens",
        description="The maximum number of tokens to generate",
    )

    @classmethod
    def get_recommended_models(cls):
        return [
            HFImageToText(
                repo_id="Salesforce/blip-image-captioning-base",
                allow_patterns=["*.bin", "*.json", "*.txt    "],
            ),
            HFImageToText(
                repo_id="Salesforce/blip-image-captioning-large",
                allow_patterns=["*.bin", "*.json", "*.txt"],
            ),
            HFImageToText(
                repo_id="nlpconnect/vit-gpt2-image-captioning",
                allow_patterns=["*.bin", "*.json", "*.txt"],
            ),
            HFImageToText(
                repo_id="microsoft/git-base-coco",
                allow_patterns=["*.bin", "*.json", "*.txt"],
            ),
        ]

    def required_inputs(self):
        return ["image"]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context=context,
            pipeline_task="image-to-text",
            model_id=self.model.repo_id,
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> str:
        assert self._pipeline is not None
        image = await context.image_to_pil(self.image)
        result = self._pipeline(image, max_new_tokens=self.max_new_tokens)
        assert isinstance(result, list)
        assert len(result) == 1
        return result[0]["generated_text"]


class VisualQuestionAnswering(HuggingFacePipelineNode):
    """
    Answers questions about images.
    image, text, question answering, multimodal

    Use cases:
    - Image content analysis
    - Automated image captioning
    - Visual information retrieval
    - Accessibility tools for visually impaired users
    """

    model: HFVisualQuestionAnswering = Field(
        default=HFVisualQuestionAnswering(),
        title="Model ID on Huggingface",
        description="The model ID to use for visual question answering",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The image to analyze",
    )
    question: str = Field(
        default="",
        title="Question",
        description="The question to be answered about the image",
    )

    @classmethod
    def get_recommended_models(cls):
        return [
            HFVisualQuestionAnswering(
                repo_id="Salesforce/blip-vqa-base",
                allow_patterns=["*.bin", "*.json", "*.txt"],
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._pipeline = await self.load_pipeline(
            context=context,
            pipeline_task="visual-question-answering",
            model_id=self.model.repo_id,
        )

    async def move_to_device(self, device: str):
        self._pipeline.model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> str:
        assert self._pipeline is not None
        image = await context.image_to_pil(self.image)
        result = self._pipeline(image, question=self.question)
        assert isinstance(result, list)
        assert len(result) == 1
        return result[0]["answer"]


# class MiniCPM(HuggingFacePipelineNode):
#     """
#     Answers questions about images.
#     image, text, question answering, multimodal

#     Use cases:
#     - Image content analysis
#     - Automated image captioning
#     - Visual information retrieval
#     - Accessibility tools for visually impaired users
#     """

#     model: HFMiniCPM = Field(
#         default=HFMiniCPM(),
#         title="Model ID on Huggingface",
#         description="The model ID to use for visual question answering",
#     )
#     image: ImageRef = Field(
#         default=ImageRef(),
#         title="Image 1",
#         description="The image to analyze",
#     )
#     system_prompt: str = Field(
#         default="",
#         title="System Prompt",
#         description="The system prompt to use for the model",
#     )
#     question: str = Field(
#         default="",
#         title="Question",
#         description="The question to be answered about the image",
#     )
#     sampling: bool = Field(
#         default=True,
#         title="Sampling",
#         description="Whether to use sampling or beam search",
#     )
#     temperature: float = Field(
#         default=0.7,
#         title="Temperature",
#         description="The temperature to use for sampling",
#     )

#     _model: AutoModel | None = None
#     _tokenizer: AutoTokenizer | None = None

#     @classmethod
#     def get_recommended_models(cls):
#         return [
#             HFMiniCPM(
#                 repo_id="openbmb/MiniCPM-V-2_6",
#             ),
#             HFMiniCPM(
#                 repo_id="openbmb/MiniCPM-V-2_6-int4",
#             ),
#         ]

#     async def initialize(self, context: ProcessingContext):
#         self._model = await self.load_model(
#             context=context,
#             model_id=self.model.repo_id,
#             model_class=AutoModel,
#             trust_remote_code=True,
#             attn_implementation="sdpa",
#             torch_dtype=torch.bfloat16,
#             variant=None,
#         )
#         self._model.eval()  # type: ignore
#         self._tokenizer = await self.load_model(
#             context=context,
#             model_id=self.model.repo_id,
#             model_class=AutoTokenizer,
#             trust_remote_code=True,
#         )

#     async def move_to_device(self, device: str):
#         # self._model.to(device)  # type: ignore
#         pass

#     async def process(self, context: ProcessingContext) -> str:
#         assert self._model is not None
#         assert self._tokenizer is not None
#         image = await context.image_to_pil(self.image)

#         msgs = [
#             {
#                 "role": "user",
#                 "content": self.question,
#             }
#         ]

#         res = self._model.chat(  # type: ignore
#             image=image,
#             msgs=msgs,
#             tokenizer=self._tokenizer,
#             sampling=self.sampling,
#             temperature=self.temperature,
#             system_prompt=self.system_prompt,
#         )
#         generated_text = ""
#         for tok in res:
#             generated_text += tok
#         return generated_text

from enum import Enum


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


class PaddleOCRNode(HuggingFacePipelineNode):
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
