import asyncio
from enum import Enum
from typing import Any

from pydantic import Field
import torch
from nodetool.metadata.types import (
    HFGOTOCR,
    HFMiniCPM,
    ImageRef,
    HFVisualQuestionAnswering,
    HFImageToText,
    HFMaskGeneration,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext
from transformers import AutoModel, AutoTokenizer


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


class OCRType(str, Enum):
    OCR = "ocr"
    FORMAT = "format"


class GOTOCR(HuggingFacePipelineNode):
    """
    Performs OCR on images using the GOT-OCR model.
    image, text, OCR, multimodal

    Use cases:
    - Text extraction from images
    - Document digitization
    - Image-based information retrieval
    - Accessibility tools for visually impaired users
    """

    model: HFGOTOCR = Field(
        default=HFGOTOCR(),
        title="Model ID on Huggingface",
        description="The model ID to use for GOT-OCR",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The image to perform OCR on",
    )
    ocr_type: OCRType = Field(
        default=OCRType.OCR,
        title="OCR Type",
        description="The type of OCR to perform",
    )
    ocr_box: str = Field(
        default="",
        title="OCR Box",
        description="Bounding box for fine-grained OCR (optional)",
    )
    ocr_color: str = Field(
        default="",
        title="OCR Color",
        description="Color for fine-grained OCR (optional)",
    )

    _model: AutoModel | None = None
    _tokenizer: AutoTokenizer | None = None

    @classmethod
    def get_recommended_models(cls):
        return [
            HFGOTOCR(
                repo_id="ucaslcl/GOT-OCR2_0",
            ),
        ]

    async def initialize(self, context: ProcessingContext):
        self._tokenizer = await self.load_model(
            context=context,
            model_id=self.model.repo_id,
            model_class=AutoTokenizer,
            trust_remote_code=True,
        )
        self._model = await self.load_model(
            context=context,
            model_id=self.model.repo_id,
            model_class=AutoModel,
            trust_remote_code=True,
            low_cpu_mem_usage=True,
            device_map="cuda",
            use_safetensors=True,
            pad_token_id=self._tokenizer.eos_token_id,  # type: ignore
        )
        self._model.eval()  # type: ignore

    async def move_to_device(self, device: str):
        self._model.to(device)  # type: ignore

    async def process(self, context: ProcessingContext) -> str:
        assert self._model is not None
        assert self._tokenizer is not None

        image = await context.image_to_pil(self.image)

        kwargs = {
            "ocr_type": self.ocr_type.value,
            "ocr_color": self.ocr_color if self.ocr_color else None,
            "images": [image],
        }
        kwargs = {k: v for k, v in kwargs.items() if v is not None}
        res = self._model.chat(self._tokenizer, **kwargs)  # type: ignore

        return res
