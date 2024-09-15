import asyncio
from enum import Enum
from typing import Any

from pydantic import Field
from nodetool.metadata.types import (
    ImageRef,
    HFVisualQuestionAnswering,
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

    class ImageToTextModelId(str, Enum):
        MICROSOFT_GIT_BASE_COCO = "microsoft/git-base-coco"
        NLPCONNECT_VIT_GPT2_IMAGE_CAPTIONING = "nlpconnect/vit-gpt2-image-captioning"
        SALESFORCE_BLIP_IMAGE_CAPTIONING_BASE = "Salesforce/blip-image-captioning-base"
        SALESFORCE_BLIP_IMAGE_CAPTIONING_LARGE = (
            "Salesforce/blip-image-captioning-large"
        )

    model: ImageToTextModelId = Field(
        default=ImageToTextModelId.SALESFORCE_BLIP_IMAGE_CAPTIONING_BASE,
        title="Model ID on Huggingface",
        description="The model ID to use for image-to-text generation",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The image to generate text from",
    )
    max_new_tokens: int = Field(
        default=50,
        title="Max New Tokens",
        description="The maximum number of tokens to generate",
    )

    def required_inputs(self):
        return ["inputs"]

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "image-to-text"

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    def get_params(self):
        return {
            "max_new_tokens": self.max_new_tokens,
        }

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> str:
        return result[0]["generated_text"]

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> str:
        return result[0]["generated_text"]

    async def process(self, context: ProcessingContext) -> str:
        return await super().process(context)


class MaskGeneration(HuggingFacePipelineNode):
    """
    Generates masks for images using segmentation models.
    image, segmentation, mask generation, computer vision

    Use cases:
    - Object segmentation in images
    - Background removal
    - Image editing and manipulation
    - Scene understanding and analysis
    """

    class MaskGenerationModelId(str, Enum):
        FACEBOOK_SAM_VIT_BASE = "facebook/sam-vit-base"
        FACEBOOK_SAM_VIT_HUGE = "facebook/sam-vit-huge"
        FACEBOOK_SAM_VIT_LARGE = "facebook/sam-vit-large"

    model: MaskGenerationModelId = Field(
        default=MaskGenerationModelId.FACEBOOK_SAM_VIT_BASE,
        title="Model ID on Huggingface",
        description="The model ID to use for mask generation",
    )
    inputs: ImageRef = Field(
        default=ImageRef(),
        title="Input Image",
        description="The image to generate masks for",
    )
    points_per_side: int = Field(
        default=32,
        title="Points per Side",
        description="Number of points to be sampled along each side of the image",
        ge=1,
        le=64,
    )

    def required_inputs(self):
        return ["inputs"]

    def get_model_id(self):
        return self.model.value

    @property
    def pipeline_task(self) -> str:
        return "mask-generation"

    def get_params(self):
        return {
            "points_per_side": self.points_per_side,
        }

    async def get_inputs(self, context: ProcessingContext):
        return await context.image_to_pil(self.inputs)

    async def process_remote_result(
        self, context: ProcessingContext, result: Any
    ) -> list[ImageRef]:
        return await self.process_local_result(context, result)

    async def process_local_result(
        self, context: ProcessingContext, result: Any
    ) -> list[ImageRef]:
        return await asyncio.gather(
            *[context.image_from_numpy(mask) for mask in result["masks"]]
        )

    async def process(self, context: ProcessingContext) -> list[ImageRef]:
        return await super().process(context)


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
