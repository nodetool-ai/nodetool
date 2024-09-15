import asyncio
from enum import Enum
from typing import Any

from pydantic import Field
from nodetool.metadata.types import (
    ImageRef,
    HFVisualQuestionAnswering,
    HFImageToText,
    HFMaskGeneration,
)
from nodetool.nodes.huggingface.huggingface_pipeline import HuggingFacePipelineNode
from nodetool.workflows.processing_context import ProcessingContext


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

    class VisualQuestionAnsweringModelId(str, Enum):
        MICROSOFT_GIT_BASE_TEXTVQA = "microsoft/git-base-textvqa"
        DANDELIN_VLT5_BASE_FINETUNED_VQA = "dandelin/vilt-b32-finetuned-vqa"
        SALEFORCE_BLIP_VQA_BASE = "Salesforce/blip-vqa-base"

    model: VisualQuestionAnsweringModelId = Field(
        default=VisualQuestionAnsweringModelId.MICROSOFT_GIT_BASE_TEXTVQA,
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

    def required_inputs(self):
        return ["image", "question"]

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "visual-question-answering"

    async def get_inputs(self, context: ProcessingContext):
        image = await context.image_to_pil(self.image)
        return {
            "image": image,
            "question": self.question,
        }

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> str:
        return result[0]["answer"]

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> str:
        return result[0]["answer"]

    async def process(self, context: ProcessingContext) -> str:
        return await super().process(context)
