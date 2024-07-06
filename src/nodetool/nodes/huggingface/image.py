from enum import Enum
from nodetool.metadata.types import ImageRef
from nodetool.providers.huggingface.huggingface_node import HuggingfaceNode
from nodetool.workflows.processing_context import ProcessingContext
from pydantic import Field
from typing import Any
import asyncio


class Classifier(HuggingfaceNode):
    """
    Classifies images into predefined categories.
    image, classification, labeling, categorization

    Use cases:
    - Content moderation by detecting inappropriate images
    - Organizing photo libraries by automatically tagging images
    - Visual quality control in manufacturing to identify defective products
    - Medical image analysis to assist in diagnosing conditions
    """

    class ModelId(str, Enum):
        GOOGLE_VIT_BASE_PATCH16_224 = "google/vit-base-patch16-224"
        MICROSOFT_RESNET_50 = "microsoft/resnet-50"
        MICROSOFT_RESNET_18 = "microsoft/resnet-18"
        APPLE_MOBILEVIT_SMALL = "apple/mobilevit-small"
        NATERAW_VIT_AGE_CLASSIFIER = "nateraw/vit-age-classifier"
        FALCONSAI_NSFW_IMAGE_DETECTION = "Falconsai/nsfw_image_detection"
        MICROSOFT_BEIT_BASE_PATCH16_224_PT22K_FT22K = (
            "microsoft/beit-base-patch16-224-pt22k-ft22k"
        )
        TIMM_VIT_LARGE_PATCH14_CLIP_224_OPENAI_FT_IN12K_IN1K = (
            "timm/vit_large_patch14_clip_224.openai_ft_in12k_in1k"
        )
        ORGANIKA_SDXL_DETECTOR = "Organika/sdxl-detector"
        RIZVANDWIKI_GENDER_CLASSIFICATION_2 = "rizvandwiki/gender-classification-2"

    model: ModelId = Field(
        default=ModelId.GOOGLE_VIT_BASE_PATCH16_224,
        title="Model ID on Huggingface",
        description="The model ID to use for the classification",
    )
    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to classify",
    )

    async def process(self, context: ProcessingContext) -> dict[str, float]:
        image = await context.asset_to_io(self.image)
        result = await self.run_huggingface(
            model_id=self.model.value, context=context, data=image.read()
        )
        return result[0]


class StableDiffusionXL(HuggingfaceNode):
    """
    Generates images from text prompts using advanced diffusion models.
    image, text, generation, synthesis, text-to-image

    Use cases:
    - Creating custom illustrations for marketing materials
    - Generating concept art for game and film development
    - Producing unique stock imagery for websites and publications
    - Visualizing interior design concepts for clients
    """

    class Scheduler(str, Enum):
        DPMSolverSDEScheduler = "DPMSolverSDEScheduler"
        EulerDiscreteScheduler = "EulerDiscreteScheduler"
        LMSDiscreteScheduler = "LMSDiscreteScheduler"
        DDIMScheduler = "DDIMScheduler"
        DDPMScheduler = "DDPMScheduler"
        HeunDiscreteScheduler = "HeunDiscreteScheduler"
        DPMSolverMultistepScheduler = "DPMSolverMultistepScheduler"
        DEISMultistepScheduler = "DEISMultistepScheduler"
        PNDMScheduler = "PNDMScheduler"
        EulerAncestralDiscreteScheduler = "EulerAncestralDiscreteScheduler"
        UniPCMultistepScheduler = "UniPCMultistepScheduler"
        KDPM2DiscreteScheduler = "KDPM2DiscreteScheduler"
        DPMSolverSinglestepScheduler = "DPMSolverSinglestepScheduler"
        KDPM2AncestralDiscreteScheduler = "KDPM2AncestralDiscreteScheduler"

    class ModelId(str, Enum):
        STABLE_DIFFUSION_XL_BASE_1_0 = "stabilityai/stable-diffusion-xl-base-1.0"
        CAGLIOSTRO_ANIMAGINE_XL_3_0 = "cagliostrolab/animagine-xl-3.0"
        NERIJS_PIXEL_ART_XL = "nerijs/pixel-art-xl"
        STABLE_DIFFUSION_XL_V8 = "stablediffusionapi/juggernaut-xl-v8"

    model: ModelId = Field(
        default=ModelId.STABLE_DIFFUSION_XL_BASE_1_0,
        title="Model ID on Huggingface",
        description="The model ID to use for the image generation",
    )
    inputs: str = Field(
        default="A photo of a cat.",
        title="Inputs",
        description="The input text to the model",
    )

    negative_prompt: str = Field(default="", description="The negative prompt to use.")
    seed: int = Field(default=0, ge=0, le=1000000)
    guidance_scale: float = Field(default=7.0, ge=1.0, le=30.0)
    num_inference_steps: int = Field(default=30, ge=1, le=100)
    width: int = Field(default=768, ge=64, le=2048, multiple_of=64)
    height: int = Field(default=768, ge=64, le=2048, multiple_of=64)
    scheduler: Scheduler = Scheduler.EulerDiscreteScheduler

    async def process(self, context: ProcessingContext) -> ImageRef:
        result = await self.run_huggingface(
            model_id=self.model.value, context=context, params={"inputs": self.inputs}
        )
        img = await context.image_from_bytes(result)  # type: ignore
        return img


class Segformer(HuggingfaceNode):
    """
    Performs semantic segmentation on images, identifying and labeling different regions.
    image, segmentation, object detection, scene parsing

    Use cases:
    - Segmenting objects in images
    - Segmenting facial features in images
    """

    image: ImageRef = Field(
        default=ImageRef(),
        title="Image",
        description="The input image to segment",
    )

    async def process(self, context: ProcessingContext) -> dict[str, ImageRef]:
        image = await context.asset_to_io(self.image)
        result = await self.run_huggingface(
            model_id="nvidia/segformer-b3-finetuned-ade-512-512",
            context=context,
            data=image.read(),
        )

        async def convert_output(item: dict[str, Any]):
            mask = await context.image_from_base64(item["mask"])
            return item["label"], mask

        items = await asyncio.gather(*[convert_output(item) for item in list(result)])
        return {label: mask for label, mask in items}
